import { Uri, workspace } from 'vscode';
import path from 'path';
import {
  IN_PLACE_THRESHOLD,
  openArchiveReader,
  readArchiveIndexTable,
  readEntryData,
  writeArchiveFile,
  writeEntryInPlace,
} from '../../node/archiveFile';
import type { BigFileEntry } from '../../formats/big/bigFormat';
import { movePath } from '../../core/paths';
import {
  buildVirtualTree,
  copyNode,
  getFileNodes,
  insertDirectory,
  insertFile,
  moveNode,
  removeNode,
  syncFiles,
} from './virtualNode';
import type { VirtualNode } from './virtualNode';

export type EntrySource =
  | { kind: 'data'; content: Uint8Array }
  | { kind: 'file'; path: string; size: number };

export type EntryChange =
  | { kind: 'put'; path: string; source: EntrySource }
  | { kind: 'remove'; path: string }
  | { kind: 'move'; from: string; to: string }
  | { kind: 'copy'; from: string; to: string }
  | { kind: 'addDirectory'; path: string };

const keysUnder = (
  entries: Map<string, BigFileEntry>,
  entryPath: string,
): string[] => {
  const key = entryPath.toLowerCase();
  const prefix = `${key}/`;

  return Array.from(entries.keys()).filter(
    (entryKey) => entryKey === key || entryKey.startsWith(prefix),
  );
};

const changeEntries = (
  entries: Map<string, BigFileEntry>,
  change: EntryChange,
): boolean => {
  switch (change.kind) {
    case 'addDirectory':
      return false;

    case 'put': {
      const { source } = change;

      entries.set(change.path.toLowerCase(), {
        name: change.path,
        offset: 0,
        size: source.kind === 'data' ? source.content.length : source.size,
        pendingData: source.kind === 'data' ? source.content : undefined,
        pendingFile: source.kind === 'file' ? source.path : undefined,
      });

      return true;
    }

    case 'remove': {
      const keys = keysUnder(entries, change.path);

      keys.forEach((key) => entries.delete(key));

      return keys.length > 0;
    }

    case 'move':
    case 'copy': {
      const keys = keysUnder(entries, change.from);

      for (const key of keys) {
        const entry = entries.get(key);

        if (!entry) {
          continue;
        }

        const movedPath = movePath(entry.name, change.from, change.to);

        if (change.kind === 'move') {
          entries.delete(key);
        }

        entries.set(movedPath.toLowerCase(), {
          ...entry,
          name: movedPath,
          storedName: undefined,
        });
      }

      return keys.length > 0;
    }
  }
};

const changeTree = (rootNode: VirtualNode, change: EntryChange): void => {
  switch (change.kind) {
    case 'put':
      insertFile(rootNode, change.path);
      break;
    case 'addDirectory':
      insertDirectory(rootNode, change.path);
      break;
    case 'remove':
      removeNode(rootNode, change.path);
      break;
    case 'move':
      moveNode(rootNode, change.from, change.to);
      break;
    case 'copy':
      copyNode(rootNode, change.from, change.to);
      break;
  }
};

export class Archive {
  public readonly archivePath: string;
  public readonly name: string;

  public readonly rootPath: string;

  public readonly sourceId: string;
  public readonly pathInSource: string;

  public readonly root: VirtualNode;

  private magic = '';

  private trailer: Uint8Array = new Uint8Array(0);

  private entries = new Map<string, BigFileEntry>();

  private shadowedEntries = new Map<BigFileEntry, BigFileEntry[]>();

  private loading?: Promise<void>;
  private loaded = false;

  private queue: Promise<unknown> = Promise.resolve();

  private lastWrittenAt = 0;

  private readAt = 0;

  private entryWrittenAt = new Map<string, number>();

  private constructor(
    archivePath: string,
    sourceId: string,
    pathInSource: string,
  ) {
    this.archivePath = archivePath;
    this.name = path.basename(archivePath);
    this.sourceId = sourceId;
    this.pathInSource = pathInSource;
    this.rootPath = `/${sourceId}/${pathInSource}`;
    this.root = buildVirtualTree(this, []);
  }

  public static create(
    archivePath: string,
    sourceId: string,
    pathInSource: string,
  ): Archive {
    return new Archive(archivePath, sourceId, pathInSource);
  }

  public ensureLoaded(): Promise<void> {
    this.loading ??= this.enqueue(async () => {
      const { magic, trailer, entries } = await readArchiveIndexTable(
        this.archivePath,
      );

      this.magic = magic;
      this.trailer = trailer;
      this.keyEntries(entries);
      this.readAt = await this.statMtime();
      this.entryWrittenAt.clear();

      syncFiles(
        this.root,
        Array.from(this.entries.values(), (entry) => entry.name),
      );

      this.loaded = true;
    });

    return this.loading;
  }

  public get isLoaded(): boolean {
    return this.loaded;
  }

  public get isLoading(): boolean {
    return Boolean(this.loading) && !this.loaded;
  }

  public get rootKey(): string {
    return this.rootPath.toLowerCase();
  }

  private keyEntries(entries: readonly BigFileEntry[]): void {
    this.entries = new Map();
    this.shadowedEntries = new Map();

    for (const entry of entries) {
      const key = entry.name.toLowerCase();
      const hidden = this.entries.get(key);

      if (hidden) {
        const shadows = this.shadowedEntries.get(hidden) ?? [];

        this.shadowedEntries.delete(hidden);
        this.shadowedEntries.set(entry, [...shadows, hidden]);
      }

      this.entries.set(key, entry);
    }
  }

  public enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);

    this.queue = run.catch(() => undefined);

    return run;
  }

  public reload(): Promise<boolean> {
    if (!this.loading) {
      return Promise.resolve(false);
    }

    return this.enqueue(async () => {
      if (await this.hasOwnWrite()) {
        return false;
      }

      const { magic, trailer, entries } = await readArchiveIndexTable(
        this.archivePath,
      );

      this.magic = magic;
      this.trailer = trailer;
      this.keyEntries(entries);
      this.readAt = await this.statMtime();
      this.entryWrittenAt.clear();

      syncFiles(
        this.root,
        Array.from(this.entries.values(), (entry) => entry.name),
      );

      return true;
    });
  }

  private async statMtime(): Promise<number> {
    try {
      return (await workspace.fs.stat(Uri.file(this.archivePath))).mtime;
    } catch {
      return 0;
    }
  }

  public getModifiedAt(entryPath: string): number {
    return this.entryWrittenAt.get(entryPath.toLowerCase()) ?? this.readAt;
  }

  private async tryWriteInPlace(
    entries: Map<string, BigFileEntry>,
    changes: readonly EntryChange[],
  ): Promise<boolean> {
    const [change] = changes;

    if (
      changes.length !== 1 ||
      change.kind !== 'put' ||
      change.source.kind !== 'data'
    ) {
      return false;
    }

    const key = change.path.toLowerCase();
    const existing = this.entries.get(key);

    if (!existing || this.shadowedEntries.has(existing)) {
      return false;
    }

    const { size } = await workspace.fs.stat(Uri.file(this.archivePath));
    const content = change.source.content;

    if (
      size < IN_PLACE_THRESHOLD ||
      !(await writeEntryInPlace(this.archivePath, existing, content))
    ) {
      return false;
    }

    this.entries = new Map(entries);
    this.entries.set(key, { ...existing, size: content.length });

    return true;
  }

  private async hasOwnWrite(): Promise<boolean> {
    if (!this.lastWrittenAt) {
      return false;
    }

    try {
      const { mtime } = await workspace.fs.stat(Uri.file(this.archivePath));

      return mtime === this.lastWrittenAt;
    } catch {
      return false;
    }
  }

  public async applyChanges(changes: readonly EntryChange[]): Promise<void> {
    await this.ensureLoaded();

    return this.enqueue(async () => {
      const entries = new Map(this.entries);
      let writeNeeded = false;

      for (const change of changes) {
        writeNeeded = changeEntries(entries, change) || writeNeeded;
      }

      if (writeNeeded && (await this.tryWriteInPlace(entries, changes))) {
        this.lastWrittenAt = await this.statMtime();
      } else if (writeNeeded) {
        const shadowedEntries = new Map(
          Array.from(this.shadowedEntries).filter(
            ([visible]) => entries.get(visible.name.toLowerCase()) === visible,
          ),
        );

        const layout = await writeArchiveFile(
          this.archivePath,
          { magic: this.magic, trailer: this.trailer },
          [...Array.from(shadowedEntries.values()).flat(), ...entries.values()],
        );

        const written = new Map(
          layout.placedEntries.map(({ entry, offset, size }) => [
            entry,
            { name: entry.name, storedName: entry.storedName, offset, size },
          ]),
        );
        const writtenEntry = (entry: BigFileEntry): BigFileEntry =>
          written.get(entry) ?? entry;

        this.entries = new Map(
          Array.from(entries, ([key, entry]) => [key, writtenEntry(entry)]),
        );
        this.shadowedEntries = new Map(
          Array.from(shadowedEntries, ([visible, shadows]) => [
            writtenEntry(visible),
            shadows.map(writtenEntry),
          ]),
        );

        this.lastWrittenAt = await this.statMtime();
      }

      if (writeNeeded) {
        const now = Date.now();

        for (const change of changes) {
          const changedPath =
            change.kind === 'move' || change.kind === 'copy'
              ? change.to
              : change.path;

          for (const key of this.entries.keys()) {
            if (
              key === changedPath.toLowerCase() ||
              key.startsWith(`${changedPath.toLowerCase()}/`)
            ) {
              this.entryWrittenAt.set(key, now);
            }
          }
        }
      }

      for (const change of changes) {
        changeTree(this.root, change);
      }
    });
  }

  public getEntry(entryPath: string): BigFileEntry | undefined {
    return this.entries.get(entryPath.toLowerCase());
  }

  public readEntry(entryPath: string): Promise<Uint8Array | undefined> {
    return this.enqueue(async () => {
      const entry = this.getEntry(entryPath);

      return entry && readEntryData(this.archivePath, entry);
    });
  }

  public async readFileNodes<T extends { node: VirtualNode }>(
    items: readonly T[],
    onFile: (item: T, content: Uint8Array) => Promise<void>,
  ): Promise<void> {
    await this.ensureLoaded();

    return this.enqueue(async () => {
      const reader = await openArchiveReader(this.archivePath);

      try {
        for (const item of items) {
          const entry = this.getEntry(item.node.entryPath);

          if (!entry) {
            throw new Error(
              `Entry missing from archive: ${item.node.entryPath}`,
            );
          }

          await onFile(item, await reader.readEntry(entry));
        }
      } finally {
        await reader.close();
      }
    });
  }

  public getFileEntryPaths(node: VirtualNode): string[] {
    return getFileNodes(node).map((fileNode) => fileNode.entryPath);
  }
}
