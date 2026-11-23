import { buildSearchPattern } from '../../core/buildSearchPattern';
import { collectLineMatches } from '../../core/collectLineMatches';
import { compilePathFilter } from '../../core/compilePathFilter';
import { decodeIniText } from '../../core/windows1252';
import { looksBinary } from '../../core/looksBinary';
import { createListScanner } from '../../node/createListScanner';
import { createMatchScanner } from '../../node/createMatchScanner';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { VirtualNode } from '../../services/archives/virtualNode';
import { getNodeUri } from '../../services/archives/nodeAddress';
import { getFileNodes } from '../../services/archives/virtualTree';
import type {
  FileResult,
  SearchRequest,
  ToSearchPage,
} from '../../webview/archiveSearch/protocol';

const TEXT_ENTRY_PATTERN =
  /\.(ini|inc|bhav|str|txt|wnd|lua|xml|csv|cfg|scb|mll|htm|html)$/i;

export const MATCH_LIMIT = 5000;

const MATCHES_PER_ENTRY = 500;

const MAX_ENTRY_BYTES = 8 * 1024 * 1024;

const ENTRY_TIME_LIMIT = 1000;

const MAX_SLOW_ENTRIES = 3;

const BATCH_SIZE = 20;
const BATCH_MILLISECONDS = 80;

const NAME_BATCH_SIZE = 500;

const NAME_CHUNK_SIZE = 4096;

const PROGRESS_MILLISECONDS = 100;

const YIELD_MILLISECONDS = 30;

const yieldThread = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

export interface SearchSink {
  post: (message: ToSearchPage) => void;
  isCancelled: () => boolean;
}

class StopSearch extends Error {}

export const runArchiveSearch = async (
  archives: ArchiveModel,
  id: number,
  request: SearchRequest,
  { post, isCancelled }: SearchSink,
): Promise<void> => {
  const pattern = buildSearchPattern(request.query);

  if ('error' in pattern) {
    post({ kind: 'failed', id, message: pattern.error });
    return;
  }

  const accepts = compilePathFilter(request.include, request.exclude);
  const timeLimit = request.query.regex ? ENTRY_TIME_LIMIT : undefined;
  const scan = createMatchScanner(pattern.source, pattern.flags, timeLimit);
  const scanNames = createListScanner(pattern.source, pattern.flags, timeLimit);
  const contextLines = Math.max(0, Math.min(request.contextLines, 10));
  const totals = { files: 0, matches: 0, searched: 0, slow: 0 };
  let isLimitHit = false;
  let isPatternSlow = false;
  let pending: FileResult[] = [];
  let lastFlush = Date.now();
  let lastProgress = 0;
  let lastYield = Date.now();

  const flush = (): void => {
    if (pending.length) {
      post({ kind: 'files', id, files: pending });
      pending = [];
    }

    lastFlush = Date.now();
  };

  const searchNames = (root: VirtualNode): void => {
    const nodes = getFileNodes(root).filter((node) => accepts(node.entryPath, root.name));
    const archiveFolder = root.archive.pathInSource.slice(0, -root.name.length);

    totals.searched += nodes.length;

    for (let start = 0; start < nodes.length; start += NAME_CHUNK_SIZE) {
      const chunk = nodes.slice(start, start + NAME_CHUNK_SIZE);
      const { matches, timedOut } = scanNames(
        chunk.map((node) => node.entryPath),
        MATCHES_PER_ENTRY,
        MATCH_LIMIT - totals.matches + MATCHES_PER_ENTRY,
      );

      if (timedOut) {
        totals.slow += chunk.length;
        isPatternSlow = true;
        return;
      }

      for (let at = 0; at < matches.length; ) {
        const index = matches[at];
        const offsets: number[] = [];

        for (; at < matches.length && matches[at] === index; at += 3) {
          offsets.push(matches[at + 1], matches[at + 2]);
        }

        const node = chunk[index];
        const { blocks, matchCount } = collectLineMatches(node.entryPath, offsets, 0);

        totals.files += 1;
        totals.matches += matchCount;
        pending.push({
          archive: root.name,
          archiveFolder,
          entryPath: node.entryPath,
          uri: getNodeUri(node).toString(),
          blocks,
          matchCount,
          isNameMatch: true,
        });

        if (totals.matches >= MATCH_LIMIT) {
          isLimitHit = true;
          return;
        }

        if (pending.length >= NAME_BATCH_SIZE) {
          flush();
        }
      }
    }
  };

  post({ kind: 'started', id });

  try {
    for (const root of archives.getArchiveRoots()) {
      if (Date.now() - lastYield >= YIELD_MILLISECONDS) {
        await yieldThread();
        lastYield = Date.now();
      }

      if (isCancelled() || isLimitHit || isPatternSlow) {
        break;
      }

      if (Date.now() - lastProgress >= PROGRESS_MILLISECONDS) {
        post({ kind: 'progress', id, archive: root.name });
        lastProgress = Date.now();
      }

      try {
        await archives.loadArchiveOf(root);
      } catch {
        continue;
      }

      if (request.target === 'names') {
        searchNames(root);

        if (Date.now() - lastFlush >= BATCH_MILLISECONDS) {
          flush();
        }
        continue;
      }

      const nodes = getFileNodes(root).filter((node) => {
        if (!TEXT_ENTRY_PATTERN.test(node.name)) {
          return false;
        }

        const size = archives.getFileSize(node);

        return size > 0 && size <= MAX_ENTRY_BYTES && accepts(node.entryPath, root.name);
      });

      try {
        await archives.readFiles(
          nodes.map((node) => ({ node })),
          async ({ node }, content) => {
            if (isCancelled()) {
              throw new StopSearch();
            }

            if (looksBinary(content)) {
              return;
            }

            totals.searched += 1;

            const text = decodeIniText(content);
            const { matches, timedOut } = scan(
              text,
              Math.min(MATCHES_PER_ENTRY, MATCH_LIMIT - totals.matches),
            );

            totals.slow += timedOut ? 1 : 0;

            if (totals.slow >= MAX_SLOW_ENTRIES) {
              isPatternSlow = true;
              throw new StopSearch();
            }

            if (matches.length) {
              const { blocks, matchCount } = collectLineMatches(
                text,
                matches,
                contextLines,
              );

              totals.files += 1;
              totals.matches += matchCount;
              pending.push({
                archive: root.name,
                archiveFolder: root.archive.pathInSource.slice(
                  0,
                  -root.name.length,
                ),
                entryPath: node.entryPath,
                uri: getNodeUri(node).toString(),
                blocks,
                matchCount,
              });
            }

            if (totals.matches >= MATCH_LIMIT) {
              isLimitHit = true;
              throw new StopSearch();
            }

            if (
              pending.length >= BATCH_SIZE ||
              (pending.length && Date.now() - lastFlush >= BATCH_MILLISECONDS)
            ) {
              flush();
            }
          },
        );
      } catch {
      }

      flush();
    }

    flush();
    post({
      kind: 'finished',
      id,
      summary: {
        fileCount: totals.files,
        matchCount: totals.matches,
        searchedCount: totals.searched,
        isLimitHit,
        isPatternSlow,
        isCancelled: isCancelled(),
        slowCount: totals.slow,
      },
    });
  } catch (error) {
    flush();
    post({
      kind: 'failed',
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
