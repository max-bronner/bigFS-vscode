import { FileSystemError, FileType } from 'vscode';
import type { LogOutputChannel, Uri } from 'vscode';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { isContainedPath, isPathBelow } from '../../core/paths';
import { findConflicts, planTransfer } from '../../core/transferPlan';
import type { ConflictChoice, TransferItem } from '../../core/transferPlan';
import type { Archive, EntryChange, EntrySource } from './archive';
import type { ArchivePolicy } from './archivePolicy';
import { getChangedPaths } from './getChangedPaths';
import type { ArchiveRegistry } from './archiveRegistry';
import { findBlockingFile, getFileNodes, getRelativeEntryPath, isArchiveRoot } from './virtualTree';
import { getNodePath } from './nodeAddress';
import type { VirtualNode } from './virtualNode';

export interface ImportedFile {
  name: string;
  size: number;
  sourcePath?: string;
  content?: Uint8Array;
}

export interface TransferResult {
  transferred: number;
  removed: number;
}

export type ArchiveLookup = Pick<
  ArchiveRegistry,
  | 'fireChanged'
  | 'requireResolvedUri'
  | 'getArchiveOf'
  | 'getNode'
  | 'groupByArchive'
  | 'getDirectoryContent'
  | 'readFiles'
>;

export interface ArchiveOperations {
  writeFile(uri: Uri, content: Uint8Array): Promise<void>;
  writeFiles(
    files: readonly { uri: Uri; content: Uint8Array }[],
  ): Promise<void>;
  createDirectory(uri: Uri): Promise<void>;
  delete(uri: Uri): Promise<void>;
  deleteNodes(nodes: readonly VirtualNode[]): Promise<void>;
  rename(oldUri: Uri, newUri: Uri): Promise<void>;
  moveNodes(
    sources: readonly VirtualNode[],
    targetDirectory: VirtualNode,
  ): Promise<void>;
  copyNodes(
    copies: readonly { source: VirtualNode; targetName: string }[],
    targetDirectory: VirtualNode,
  ): Promise<void>;
  addFiles(
    targetDirectory: VirtualNode,
    files: readonly ImportedFile[],
  ): Promise<void>;
  transferNodes(
    sources: readonly VirtualNode[],
    targetDirectory: VirtualNode,
    move: boolean,
    choose: (names: string[]) => Promise<ConflictChoice | undefined>,
  ): Promise<TransferResult>;
}

const STAGE_LIMIT = 8 * 1024 * 1024;

const joinEntryPath = (directoryPath: string, name: string): string =>
  directoryPath ? `${directoryPath}/${name}` : name;

const toEntrySource = (file: ImportedFile): EntrySource =>
  file.sourcePath
    ? { kind: 'file', path: file.sourcePath, size: file.size }
    : { kind: 'data', content: file.content ?? new Uint8Array() };

const ensureWritablePath = (archive: Archive, entryPath: string): void => {
  if (!isContainedPath(entryPath)) {
    throw FileSystemError.NoPermissions(`Invalid entry path: ${entryPath}`);
  }

  const blockingFile = findBlockingFile(archive.root, entryPath);

  if (blockingFile) {
    throw FileSystemError.FileNotADirectory(getNodePath(blockingFile));
  }
};

const ensureMovable = (from: string, to: string): void => {
  if (!isContainedPath(to)) {
    throw FileSystemError.NoPermissions(`Invalid entry path: ${to}`);
  }

  const fromKey = from.toLowerCase();
  const toKey = to.toLowerCase();

  if (toKey !== fromKey && isPathBelow(toKey, fromKey)) {
    throw FileSystemError.NoPermissions('Cannot move an entry into itself');
  }
};

export const createArchiveOperations = (
  lookup: ArchiveLookup,
  policy: ArchivePolicy,
  log: LogOutputChannel,
): ArchiveOperations => {
  const apply = async (
    archive: Archive,
    changes: readonly EntryChange[],
  ): Promise<void> => {
    policy.ensureArchiveWritable(archive);

    try {
      await archive.applyChanges(changes);
    } catch (error) {
      log.error(`Failed to save archive ${archive.archivePath}`, error);
      throw error;
    }

    lookup.fireChanged(archive, 'changed', false, getChangedPaths(changes));
  };

  const operations: ArchiveOperations = {
    async writeFile(uri, content) {
      const { archive, entryPath } = lookup.requireResolvedUri(uri);

      if (!entryPath) {
        throw FileSystemError.NoPermissions('Cannot write to the archive root');
      }

      if (lookup.getNode(uri)?.type === FileType.Directory) {
        throw FileSystemError.FileIsADirectory(uri);
      }

      ensureWritablePath(archive, entryPath);

      await apply(archive, [
        { kind: 'put', path: entryPath, source: { kind: 'data', content } },
      ]);
    },

    async writeFiles(files) {
      const byArchive = new Map<Archive, EntryChange[]>();

      for (const { uri, content } of files) {
        const { archive, entryPath } = lookup.requireResolvedUri(uri);

        if (!entryPath) {
          throw FileSystemError.NoPermissions(
            'Cannot write to the archive root',
          );
        }

        ensureWritablePath(archive, entryPath);
        byArchive.set(archive, [
          ...(byArchive.get(archive) ?? []),
          { kind: 'put', path: entryPath, source: { kind: 'data', content } },
        ]);
      }
      for (const [archive, changes] of byArchive) {
        await apply(archive, changes);
      }
    },

    async createDirectory(uri) {
      const { archive, entryPath } = lookup.requireResolvedUri(uri);

      if (!entryPath) {
        throw FileSystemError.NoPermissions('Cannot create the archive root');
      }

      ensureWritablePath(archive, entryPath);

      await apply(archive, [{ kind: 'addDirectory', path: entryPath }]);
    },

    async delete(uri) {
      const node = lookup.getNode(uri);

      if (!node) {
        throw FileSystemError.FileNotFound(uri);
      }

      await operations.deleteNodes([node]);
    },

    async deleteNodes(nodes) {
      for (const [archive, group] of lookup.groupByArchive(nodes)) {
        await apply(
          archive,
          group.map((node) => ({
            kind: 'remove' as const,
            path: node.entryPath,
          })),
        );
      }
    },

    async rename(oldUri, newUri) {
      const source = lookup.requireResolvedUri(oldUri);
      const target = lookup.requireResolvedUri(newUri);

      if (source.archive !== target.archive) {
        throw FileSystemError.NoPermissions('Cannot move between archives');
      }

      if (!source.entryPath || !target.entryPath) {
        throw FileSystemError.NoPermissions('Cannot move the archive itself');
      }

      ensureMovable(source.entryPath, target.entryPath);

      await apply(source.archive, [
        { kind: 'move', from: source.entryPath, to: target.entryPath },
      ]);
    },

    async moveNodes(sources, targetDirectory) {
      const archive = lookup.getArchiveOf(targetDirectory);
      const targetPath = targetDirectory.entryPath;

      const changes = sources.map((source) => {
        const from = source.entryPath;
        const to = joinEntryPath(targetPath, source.name);

        ensureMovable(from, to);

        return { kind: 'move' as const, from, to };
      });

      await apply(archive, changes);
    },

    async copyNodes(copies, targetDirectory) {
      const archive = lookup.getArchiveOf(targetDirectory);
      const targetPath = targetDirectory.entryPath;

      const changes = copies.map(({ source, targetName }) => ({
        kind: 'copy' as const,
        from: source.entryPath,
        to: joinEntryPath(targetPath, targetName),
      }));

      await apply(archive, changes);
    },

    async addFiles(targetDirectory, files) {
      const archive = lookup.getArchiveOf(targetDirectory);
      const targetPath = targetDirectory.entryPath;

      const changes = files.map((file) => {
        const entryPath = joinEntryPath(targetPath, file.name);

        ensureWritablePath(archive, entryPath);

        return {
          kind: 'put' as const,
          path: entryPath,
          source: toEntrySource(file),
        };
      });

      await apply(archive, changes);
    },

    async transferNodes(sources, targetDirectory, move, choose) {
      const archive = lookup.getArchiveOf(targetDirectory);
      const files: (TransferItem & { node: VirtualNode })[] = [];

      for (const source of sources) {
        if (isArchiveRoot(source)) {
          continue;
        }

        for (const node of getFileNodes(source)) {
          files.push({
            node,
            path:
              node === source
                ? source.name
                : `${source.name}/${getRelativeEntryPath(source, node)}`,
          });
        }
      }

      const content = lookup.getDirectoryContent(targetDirectory);
      const conflicts = findConflicts(files, content);
      let choice: ConflictChoice = 'replace';

      if (conflicts.length) {
        const answer = await choose(conflicts.map((conflict) => conflict.path));

        if (!answer) {
          return { transferred: 0, removed: 0 };
        }

        choice = answer;
      }

      const plan = planTransfer(files, content, choice);

      if (!plan.length) {
        return { transferred: 0, removed: 0 };
      }

      const targetPath = targetDirectory.entryPath;
      const entryPaths = plan.map((planned) =>
        joinEntryPath(targetPath, planned.targetPath),
      );

      for (const entryPath of entryPaths) {
        ensureWritablePath(archive, entryPath);
      }

      const staging = await mkdtemp(path.join(tmpdir(), 'bigfs-transfer-'));

      try {
        const sourcesOfPut = new Map<string, EntrySource>();
        let staged = 0;

        await lookup.readFiles(
          plan.map((planned, index) => ({ node: planned.item.node, index })),
          async ({ index }, bytes) => {
            if (bytes.length <= STAGE_LIMIT) {
              sourcesOfPut.set(entryPaths[index], {
                kind: 'data',
                content: bytes,
              });
              return;
            }

            const file = path.join(staging, String(staged++));

            await writeFile(file, bytes);
            sourcesOfPut.set(entryPaths[index], {
              kind: 'file',
              path: file,
              size: bytes.length,
            });
          },
        );

        const changes: EntryChange[] = entryPaths.map((entryPath) => ({
          kind: 'put',
          path: entryPath,
          source: sourcesOfPut.get(entryPath) as EntrySource,
        }));

        const removals = new Map<Archive, EntryChange[]>();

        for (const { item } of move ? plan : []) {
          const origin = item.node.archive;

          if (policy.isArchiveReadOnly(origin)) {
            continue;
          }

          const group = removals.get(origin) ?? [];

          group.push({ kind: 'remove', path: item.node.entryPath });
          removals.set(origin, group);
        }

        await apply(archive, [...changes, ...(removals.get(archive) ?? [])]);

        for (const [origin, group] of removals) {
          if (origin !== archive) {
            await apply(origin, group);
          }
        }

        return {
          transferred: plan.length,
          removed: Array.from(removals.values()).reduce(
            (total, group) => total + group.length,
            0,
          ),
        };
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    },
  };

  return operations;
};
