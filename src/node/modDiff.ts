import { open, readFile } from 'fs/promises';
import * as path from 'path';
import { scanInstalls } from './installScan';
import type { ScanOptions } from './installScan';
import type { BaseArchive } from './modPackage';

export interface BaseEntry {
  archive: string;
  offset: number;
  size: number;
  loose?: boolean;
}

export type BaseIndex = Map<string, BaseEntry>;

export const indexBaseGame = async (
  folders: string | readonly string[],
  options: ScanOptions = {},
): Promise<{ index: BaseIndex; archives: number; unreadable: string[] }> => {
  const layers = typeof folders === 'string' ? [folders] : folders;
  const { installs, files } = await scanInstalls(layers, options);
  const index: BaseIndex = new Map();

  for (const { entryPath, ref } of files) {
    const key = entryPath.toLowerCase();

    if (!index.has(key)) {
      index.set(
        key,
        ref.kind === 'loose'
          ? { archive: ref.path, offset: 0, size: ref.size, loose: true }
          : { archive: ref.path, offset: ref.offset, size: ref.size },
      );
    }
  }

  return {
    index,
    archives: installs.reduce(
      (sum, { archives, unreadable }) =>
        sum + archives.length + unreadable.length,
      0,
    ),
    unreadable: installs.flatMap(({ folder, unreadable }) =>
      unreadable.map((each) =>
        layers.length > 1 ? `${path.basename(folder)}/${each}` : each,
      ),
    ),
  };
};

export const listBaseArchives = async (
  folders: string | readonly string[],
  options: ScanOptions = {},
): Promise<{ archives: BaseArchive[]; unreadable: string[] }> => {
  const layers = typeof folders === 'string' ? [folders] : folders;
  const { installs } = await scanInstalls(layers, options);
  const archives: BaseArchive[] = [];

  installs.forEach((install, layer) => {
    if (install.loose.length) {
      archives.push({
        path: `${path.basename(install.folder)} (loose files)`,
        layer,
        loose: true,
        entries: new Set(
          install.loose.map((file) => file.entryPath.toLowerCase()),
        ),
      });
    }

    for (const archive of install.archives) {
      archives.push({
        path: archive.pathInInstall,
        layer,
        entries: new Set(
          archive.files.map((file) => file.entryPath.toLowerCase()),
        ),
      });
    }
  });

  return {
    archives,
    unreadable: installs.flatMap((install) => install.unreadable),
  };
};

export const readBaseEntry = async (entry: BaseEntry): Promise<Uint8Array> => {
  if (entry.loose) {
    return readFile(entry.archive);
  }

  const file = await open(entry.archive, 'r');

  try {
    const bytes = Buffer.alloc(entry.size);
    const { bytesRead } = await file.read(bytes, 0, entry.size, entry.offset);

    return bytes.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
};

export type Change = 'added' | 'changed' | 'same';

export interface ModFile {
  entryPath: string;
  size: number;
  read: () => PromiseLike<Uint8Array>;
}

export interface ComparedFile {
  entryPath: string;
  change: Change;
  size: number;
  baseSize?: number;
}

const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

export const compareWithBase = async (
  files: ModFile[],
  base: BaseIndex,
  progress?: (done: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<ComparedFile[]> => {
  const results: ComparedFile[] = [];

  for (const [done, file] of files.entries()) {
    if (isCancelled()) {
      break;
    }

    const entry = base.get(file.entryPath.toLowerCase());

    if (!entry) {
      results.push({
        entryPath: file.entryPath,
        change: 'added',
        size: file.size,
      });
    } else if (entry.size !== file.size) {
      results.push({
        entryPath: file.entryPath,
        change: 'changed',
        size: file.size,
        baseSize: entry.size,
      });
    } else {
      const [mine, theirs] = await Promise.all([
        file.read(),
        readBaseEntry(entry),
      ]);

      results.push({
        entryPath: file.entryPath,
        change: equalBytes(mine, theirs) ? 'same' : 'changed',
        size: file.size,
        baseSize: entry.size,
      });
    }

    progress?.(done + 1);
  }

  return results;
};
