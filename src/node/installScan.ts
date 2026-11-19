import { readdir, stat } from 'fs/promises';
import * as path from 'path';
import { readArchiveIndexTable } from './archiveFile';
import { orderInstallFiles } from '../game/install/gameView';
import type { GameFile, InstallFiles } from '../game/install/gameView';

export const GAME_FOLDERS: readonly string[] = [
  'data',
  'art',
  'maps',
  'ui',
  'shaders',
  'libraries',
  'scripts',
  'lang',
  'audio',
  'sounds',
  'movies',
  'fonts',
];

const MAX_DEPTH = 8;
const MAX_LOOSE_DEPTH = 24;

export type ScanRef =
  | { kind: 'loose'; path: string; size: number }
  | { kind: 'archive'; path: string; offset: number; size: number };

export type ScanFile = GameFile<ScanRef>;

export const findArchives = async (
  folder: string,
  depth = 0,
): Promise<string[]> => {
  if (depth > MAX_DEPTH) {
    return [];
  }

  const found: string[] = [];
  let entries;

  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const full = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await findArchives(full, depth + 1)));
    } else if (entry.name.toLowerCase().endsWith('.big')) {
      found.push(full);
    }
  }

  return found;
};

export const listLooseFiles = async (
  root: string,
  folders: Iterable<string>,
): Promise<string[]> => {
  const wanted = new Set(Array.from(folders, (name) => name.toLowerCase()));
  const found: string[] = [];

  const walk = async (directory: string, relative: string, depth: number) => {
    let entries;

    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = relative ? `${relative}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (
          !entry.name.startsWith('.') &&
          depth < MAX_LOOSE_DEPTH &&
          (relative || wanted.has(entry.name.toLowerCase()))
        ) {
          await walk(path.join(directory, entry.name), entryPath, depth + 1);
        }
      } else if (
        relative &&
        entry.isFile() &&
        !entry.name.startsWith('.') &&
        !/\.big$/i.test(entry.name)
      ) {
        found.push(entryPath);
      }
    }
  };

  await walk(root, '', 0);

  return found;
};

export interface ScannedInstall extends InstallFiles<ScanRef> {
  folder: string;
  unreadable: string[];
}

export interface ScanOptions {
  exclude?: ReadonlySet<string>;
}

export const scanInstall = async (
  folder: string,
  label = path.basename(folder),
  { exclude }: ScanOptions = {},
): Promise<ScannedInstall> => {
  const archives: ScannedInstall['archives'] = [];
  const unreadable: string[] = [];
  const topFolders = new Set(GAME_FOLDERS);

  for (const archive of await findArchives(folder)) {
    if (exclude?.has(archive.toLowerCase())) {
      continue;
    }

    const pathInInstall = path.relative(folder, archive).replace(/\\/g, '/');
    let entries;

    try {
      ({ entries } = await readArchiveIndexTable(archive));
    } catch {
      unreadable.push(pathInInstall);
      continue;
    }

    const own = new Map<string, ScanFile>();

    for (const entry of entries) {
      const entryPath = entry.name.replace(/\\/g, '/');

      topFolders.add(entryPath.split('/')[0].toLowerCase());
      own.set(entryPath.toLowerCase(), {
        entryPath,
        origin: `${label}: ${pathInInstall}`,
        ref: {
          kind: 'archive',
          path: archive,
          offset: entry.offset,
          size: entry.size,
        },
      });
    }

    archives.push({ pathInInstall, files: [...own.values()] });
  }

  const loose: ScanFile[] = [];

  for (const entryPath of await listLooseFiles(folder, topFolders)) {
    const file = path.join(folder, ...entryPath.split('/'));

    try {
      loose.push({
        entryPath,
        origin: `${label} (loose)`,
        ref: { kind: 'loose', path: file, size: (await stat(file)).size },
      });
    } catch {
      continue;
    }
  }

  return { folder, loose, archives, unreadable };
};

export const scanInstalls = async (
  folders: readonly string[],
  options: ScanOptions = {},
): Promise<{ installs: ScannedInstall[]; files: ScanFile[] }> => {
  const installs: ScannedInstall[] = [];

  for (const folder of folders) {
    installs.push(await scanInstall(folder, undefined, options));
  }

  return { installs, files: orderInstallFiles(installs) };
};
