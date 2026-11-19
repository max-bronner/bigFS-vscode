import { EventEmitter, FileSystemError, FileType } from 'vscode';
import type { Event, LogOutputChannel, Uri } from 'vscode';
import { NotAnArchiveError } from '../../formats/big/bigFormat';
import type { BigFileEntry } from '../../formats/big/bigFormat';
import { delay } from '../../core/delay';
import type { Archive } from './archive';
import type { ArchiveSource } from './archiveSource';
import { findChild, getFileNodes, getRelativeEntryPath, isArchiveRoot } from './virtualTree';
import { getNodePath, parseNodeUri } from './nodeAddress';
import type { ResolvedUri } from './nodeAddress';
import type { VirtualNode } from './virtualNode';

export interface ArchiveChange {
  type: 'added' | 'changed' | 'removed';
  archivePath: string;
  rootPath: string;
  loaded?: boolean;
  entries?: readonly string[];
}

export interface ArchiveDiscovery {
  whenReady(): Promise<void>;
  discover(uri: Uri): Promise<void>;
  retryLater(archivePath: string): void;
}

export interface ArchiveRegistry {
  archives: Map<string, Archive>;
  sources: ArchiveSource[];
  readonly isDisposed: boolean;
  readonly onDidChangeArchive: Event<ArchiveChange>;
  dispose(): void;
  fireChanged(
    archive: Archive,
    kind: ArchiveChange['type'],
    loaded?: boolean,
    entries?: readonly string[],
  ): void;
  getArchiveRoots(): VirtualNode[];
  getArchivesOf(sourceId: string): readonly Archive[];
  getArchiveByPath(archivePath: string): Archive | undefined;
  resolveUri(uri: Uri): ResolvedUri | undefined;
  requireResolvedUri(uri: Uri): ResolvedUri;
  getArchiveOf(node: VirtualNode): Archive;
  getNode(uri: Uri): VirtualNode | undefined;
  resolveNode(uri: Uri): Promise<VirtualNode | undefined>;
  readArchive(archive: Archive): Promise<boolean>;
  loadArchiveOf(node: VirtualNode): Promise<void>;
  startBackgroundLoading(): void;
  getFileContent(node: VirtualNode): Promise<Uint8Array | undefined>;
  getFileSize(node: VirtualNode): number;
  getDirectoryContent(directory: VirtualNode): {
    files: string[];
    directories: string[];
  };
  readFiles<T extends { node: VirtualNode }>(
    items: readonly T[],
    onFile: (item: T, content: Uint8Array) => Promise<void>,
  ): Promise<void>;
  groupByArchive(nodes: readonly VirtualNode[]): Map<Archive, VirtualNode[]>;
}

const BACKGROUND_LOAD_DELAY = 500;

export const createArchiveRegistry = (
  log: LogOutputChannel,
  discovery: ArchiveDiscovery,
): ArchiveRegistry => {
  const onDidChangeArchive = new EventEmitter<ArchiveChange>();
  let disposed = false;

  let awaitedLoads = 0;
  let backgroundLoading: Promise<void> | undefined;

  const getEntryForNode = (node: VirtualNode): BigFileEntry | undefined => {
    if (node.type !== FileType.File) {
      return undefined;
    }

    const archive = node.archive;

    return archive?.getEntry(node.entryPath);
  };

  const loadRemaining = async (): Promise<void> => {
    await delay(BACKGROUND_LOAD_DELAY);

    for (const archive of Array.from(registry.archives.values())) {
      if (disposed) {
        return;
      }

      if (archive.isLoaded) {
        continue;
      }

      while (awaitedLoads > 0 && !disposed) {
        await delay(BACKGROUND_LOAD_DELAY);
      }

      if (await registry.readArchive(archive)) {
        registry.fireChanged(archive, 'changed', true);
      }

      await delay(0);
    }
  };

  const registry: ArchiveRegistry = {
    archives: new Map<string, Archive>(),
    sources: [],

    get isDisposed() {
      return disposed;
    },

    onDidChangeArchive: onDidChangeArchive.event,

    dispose() {
      disposed = true;
    },

    fireChanged(archive, kind, loaded = false, entries) {
      onDidChangeArchive.fire({
        type: kind,
        archivePath: archive.archivePath,
        rootPath: archive.rootPath,
        ...(loaded && { loaded }),
        ...(entries && { entries }),
      });
    },

    getArchiveRoots() {
      return Array.from(registry.archives.values(), (archive) => archive.root);
    },

    getArchivesOf(sourceId) {
      return Array.from(registry.archives.values()).filter(
        (archive) => archive.sourceId === sourceId,
      );
    },

    getArchiveByPath(archivePath) {
      const wanted = archivePath.toLowerCase();

      for (const archive of registry.archives.values()) {
        if (archive.archivePath.toLowerCase() === wanted) {
          return archive;
        }
      }

      return undefined;
    },

    resolveUri(uri) {
      return parseNodeUri(uri, registry.archives.values());
    },

    requireResolvedUri(uri) {
      const resolved = registry.resolveUri(uri);

      if (!resolved) {
        throw FileSystemError.FileNotFound(uri);
      }

      return resolved;
    },

    getArchiveOf(node) {
      const archive = node.archive;

      if (!archive) {
        throw FileSystemError.FileNotFound(getNodePath(node));
      }

      return archive;
    },

    getNode(uri) {
      const resolved = registry.resolveUri(uri);

      return resolved && findChild(resolved.archive.root, resolved.entryPath);
    },

    async resolveNode(uri) {
      if (!registry.resolveUri(uri)) {
        await discovery.whenReady();
      }
      if (!registry.resolveUri(uri)) {
        await discovery.discover(uri);
      }

      const resolved = registry.resolveUri(uri);

      if (!resolved || !(await registry.readArchive(resolved.archive))) {
        return undefined;
      }

      return registry.getNode(uri);
    },

    async readArchive(archive) {
      try {
        await archive.ensureLoaded();

        return true;
      } catch (error) {
        discovery.retryLater(archive.archivePath);
        if (error instanceof NotAnArchiveError) {
          log.info(`Ignoring ${archive.archivePath}: ${error.message}`);
        } else {
          log.error(`Failed to read archive ${archive.archivePath}`, error);
        }

        registry.archives.delete(archive.rootKey);
        registry.fireChanged(archive, 'removed');

        return false;
      }
    },

    async loadArchiveOf(node) {
      const archive = node.archive;

      if (!archive || archive.isLoaded) {
        return;
      }

      awaitedLoads += 1;

      try {
        if (await registry.readArchive(archive)) {
          registry.fireChanged(archive, 'changed', true);
        }
      } finally {
        awaitedLoads -= 1;
      }
    },

    startBackgroundLoading() {
      backgroundLoading ??= loadRemaining().finally(() => {
        backgroundLoading = undefined;
      });
    },

    async getFileContent(node) {
      return node.archive?.readEntry(node.entryPath);
    },

    getFileSize(node) {
      const entry = getEntryForNode(node);

      if (!entry) {
        return 0;
      }

      return entry.pendingData?.length ?? entry.size;
    },

    getDirectoryContent(directory) {
      const files = getFileNodes(directory).map((node) =>
        getRelativeEntryPath(directory, node),
      );
      const directories = new Set<string>();

      for (const file of files) {
        const segments = file.split('/');

        for (let depth = 1; depth < segments.length; depth += 1) {
          directories.add(segments.slice(0, depth).join('/'));
        }
      }

      return { files, directories: Array.from(directories) };
    },

    async readFiles(items, onFile) {
      for (const [archive, group] of registry.groupByArchive(
        items.map((item) => item.node),
      )) {
        const groupItems = items.filter((item) => group.includes(item.node));

        await archive.readFileNodes(groupItems, onFile);
      }
    },

    groupByArchive(nodes) {
      const grouped = new Map<Archive, VirtualNode[]>();

      for (const node of nodes) {
        if (isArchiveRoot(node)) {
          throw FileSystemError.NoPermissions('Archives cannot be changed');
        }

        const archive = registry.getArchiveOf(node);
        const group = grouped.get(archive) ?? [];

        group.push(node);
        grouped.set(archive, group);
      }

      return grouped;
    },
  };

  return registry;
};
