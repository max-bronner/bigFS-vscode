import { workspace, window, EventEmitter, FileType, Uri } from 'vscode';
import type { Disposable, Event, LogOutputChannel } from 'vscode';
import { ARCHIVE_GLOB } from '../../constants';
import { NotAnArchiveError } from '../../formats/big/bigFormat';
import { delay } from '../../core/delay';
import { Archive } from './archive';
import { createSources, findSourceFor, getPathInSource } from './archiveSource';
import { findArchives } from '../../node/installScan';
import { onDidChangeSetting, settings } from '../../platform/settings';
import type { ArchiveDiscovery, ArchiveRegistry } from './archiveRegistry';

export interface ArchiveScanner extends ArchiveDiscovery, Disposable {
  readonly onDidScan: Event<void>;
  scanWorkspace(): Promise<void>;
}

const RETRY_DELAY = 1500;

const isFile = async (uri: Uri): Promise<boolean> => {
  try {
    const { type } = await workspace.fs.stat(uri);

    return type === FileType.File;
  } catch {
    return false;
  }
};

export const createArchiveScanner = (
  registry: ArchiveRegistry,
  log: LogOutputChannel,
  readAhead: boolean,
): ArchiveScanner => {
  const onDidScan = new EventEmitter<void>();

  let scanGeneration = 0;

  let currentScan: Promise<void>;

  const retried = new Set<string>();

  const reloadArchive = async (uri: Uri): Promise<void> => {
    const archivePath = uri.fsPath;
    const loaded = registry.getArchiveByPath(archivePath);

    if (!loaded && !(await isFile(uri))) {
      return;
    }

    try {
      if (loaded) {
        if (await loaded.reload()) {
          registry.fireChanged(loaded, 'changed');
        }

        return;
      }

      const source = findSourceFor(registry.sources, uri);

      if (!source) {
        return;
      }

      const archive = Archive.create(
        archivePath,
        source.id,
        getPathInSource(source, uri),
      );

      registry.archives.set(archive.rootKey, archive);

      registry.fireChanged(archive, 'added');
    } catch (error) {
      log.error(`Failed to reload archive ${archivePath}`, error);
    }
  };

  const reloadReportedArchive = (uri: Uri): Promise<void> => {
    retried.delete(uri.fsPath);
    return reloadArchive(uri);
  };

  const forgetArchive = (uri: Uri): void => {
    const archive = registry.getArchiveByPath(uri.fsPath);

    if (!archive) {
      return;
    }

    registry.archives.delete(archive.rootKey);

    registry.fireChanged(archive, 'removed');
  };

  const watchArchives = (): Disposable => {
    const watcher = workspace.createFileSystemWatcher(ARCHIVE_GLOB);

    watcher.onDidChange((uri) => reloadReportedArchive(uri));
    watcher.onDidCreate((uri) => reloadReportedArchive(uri));
    watcher.onDidDelete((uri) => forgetArchive(uri));

    return watcher;
  };

  const runScan = async (): Promise<void> => {
    const generation = (scanGeneration += 1);
    const sources = await createSources();

    if (generation !== scanGeneration) {
      return;
    }

    if (!sources.length) {
      registry.sources = sources;
      registry.archives = new Map<string, Archive>();

      return;
    }

    const loaded = registry.archives;
    const found = new Map<string, Archive>();
    const reloaded: Archive[] = [];

    registry.sources = sources;

    const archiveUris = [
      ...(await workspace.findFiles(ARCHIVE_GLOB)),
      ...(
        await Promise.all(
          sources
            .filter((source) => source.external)
            .map((source) =>
              findArchives(source.baseUri.fsPath).catch(() => []),
            ),
        )
      )
        .flat()
        .map((archivePath) => Uri.file(archivePath)),
    ];

    const results = await Promise.allSettled(
      archiveUris.map(async (uri) => {
        const source = findSourceFor(sources, uri);

        if (!source) {
          return;
        }

        const pathInSource = getPathInSource(source, uri);
        const rootPath = `/${source.id}/${pathInSource}`;
        const known = loaded.get(rootPath.toLowerCase());

        const archive =
          known ?? Archive.create(uri.fsPath, source.id, pathInSource);

        if (known && (await known.reload())) {
          reloaded.push(known);
        }

        found.set(archive.rootKey, archive);
      }),
    );

    if (generation !== scanGeneration) {
      return;
    }

    registry.archives = found;
    reloaded.forEach((archive) => registry.fireChanged(archive, 'changed'));

    const failed = results.filter((result) => result.status === 'rejected');

    const unreadable = failed.filter(
      (result) => !(result.reason instanceof NotAnArchiveError),
    );

    failed.forEach((result) => {
      if (result.reason instanceof NotAnArchiveError) {
        log.info(
          `Ignoring a file that is not an archive: ${result.reason.message}`,
        );
      } else {
        log.error('Failed to read archive', result.reason);
      }
    });

    if (unreadable.length) {
      window.showWarningMessage(
        `${unreadable.length} of ${archiveUris.length} BIG archives could not be read.`,
      );
    }

    if (readAhead) {
      registry.startBackgroundLoading();
    }
  };

  const scanner: ArchiveScanner = {
    onDidScan: onDidScan.event,

    scanWorkspace() {
      currentScan = runScan().finally(() => onDidScan.fire());

      return currentScan;
    },

    whenReady() {
      return currentScan;
    },

    async discover(uri) {
      const [sourceId, ...segments] = uri.path.split('/').filter(Boolean);
      const source = registry.sources.find((each) => each.id === sourceId);

      if (!source) {
        return;
      }
      for (let count = 1; count <= segments.length; count++) {
        if (!/\.big$/i.test(segments[count - 1])) {
          continue;
        }

        const candidate = Uri.joinPath(
          source.baseUri,
          ...segments.slice(0, count),
        );

        if (
          !registry.getArchiveByPath(candidate.fsPath) &&
          (await isFile(candidate))
        ) {
          await reloadArchive(candidate);
        }
        return;
      }
    },

    retryLater(archivePath) {
      if (retried.has(archivePath)) {
        return;
      }
      retried.add(archivePath);
      void delay(RETRY_DELAY).then(() => {
        if (!registry.isDisposed && !registry.getArchiveByPath(archivePath)) {
          return reloadArchive(Uri.file(archivePath));
        }
      });
    },

    dispose() {
      archiveWatcher.dispose();
      sourceWatchers.forEach((watcher) => watcher.dispose());
    },
  };

  const scanInBackground = (): void => {
    scanner
      .scanWorkspace()
      .catch((error: unknown) => log.error('Failed to scan archives', error));
  };

  scanInBackground();

  const archiveWatcher = watchArchives();

  const sourceWatchers: Disposable[] = [
    workspace.onDidChangeWorkspaceFolders(scanInBackground),
    onDidChangeSetting(
      [
        settings.baseGameFolder,
        settings.underlyingGameFolder,
        settings.folderGame,
        settings.protectGameArchives,
      ],
      scanInBackground,
    ),
  ];

  return scanner;
};
