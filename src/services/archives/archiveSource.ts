import { readdir } from 'fs/promises';
import { Uri, workspace } from 'vscode';
import {
  detectInstallKind,
  isInsideSource,
  orderLayers,
} from '../../game/install/installLayers';
import type { GameId, InstallKind } from '../../game/install/installLayers';
import { settings } from '../../platform/settings';
import { findBaseGameFolders, findRegisteredBfme2 } from './baseGameFolders';

export interface ArchiveSource {
  readonly id: string;
  readonly label: string;
  readonly baseUri: Uri;
  readonly kind: InstallKind;
  readonly base: boolean;
  readonly game?: GameId;
  readonly external: boolean;
}

const toSlug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'source';

const toSuffix = (text: string): string => {
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36).slice(0, 6);
};

const detectKind = async (folder: Uri): Promise<InstallKind> => {
  if (folder.scheme !== 'file') {
    return 'mod';
  }

  try {
    return detectInstallKind(await readdir(folder.fsPath));
  } catch {
    return 'mod';
  }
};

const readFolderGame = (folder: Uri): GameId | undefined => {
  const game = settings.folderGame.getFor(folder);

  return game === 'bfme2' || game === 'rotwk' ? game : undefined;
};

export const createSources = async (): Promise<ArchiveSource[]> => {
  const taken = new Set<string>();
  const workspaceFolders = workspace.workspaceFolders ?? [];
  const baseFolders = (await findBaseGameFolders()).map((folder) =>
    Uri.file(folder),
  );
  const unique = (name: string, fsPath: string) => {
    const slug = toSlug(name);
    const id = taken.has(slug) ? `${slug}-${toSuffix(fsPath)}` : slug;

    taken.add(id);

    return id;
  };
  const sameFolder = (a: Uri, b: Uri) =>
    a.fsPath.toLowerCase() === b.fsPath.toLowerCase();
  const sources: ArchiveSource[] = [];

  for (const folder of workspaceFolders) {
    sources.push({
      id: unique(folder.name, folder.uri.fsPath),
      label: folder.name,
      baseUri: folder.uri,
      kind: await detectKind(folder.uri),
      base: baseFolders.some((base) => sameFolder(base, folder.uri)),
      external: false,
      game: readFolderGame(folder.uri),
    });
  }

  const baseKinds = await Promise.all(baseFolders.map(detectKind));
  const isForRotwk =
    baseKinds.includes('rotwk') ||
    sources.some((source) => source.kind === 'rotwk' || source.game === 'rotwk');

  if (
    isForRotwk &&
    !baseKinds.includes('bfme2') &&
    !sources.some((source) => source.kind === 'bfme2') &&
    !settings.underlyingGameFolder.get().trim()
  ) {
    const registered = await findRegisteredBfme2();

    if (registered) {
      baseFolders.push(Uri.file(registered));
    }
  }

  for (const folder of baseFolders) {
    if (
      workspaceFolders.some((held) =>
        isInsideSource(folder.fsPath, held.uri.fsPath),
      )
    ) {
      continue;
    }

    const name = folder.path.split('/').filter(Boolean).at(-1) ?? 'base game';

    sources.push({
      id: unique(`base-${name}`, folder.fsPath),
      label: `Base game: ${name}`,
      baseUri: folder,
      kind: await detectKind(folder),
      base: true,
      external: true,
    });
  }

  return orderLayers(sources);
};

export const findSourceFor = (
  sources: readonly ArchiveSource[],
  uri: Uri,
): ArchiveSource | undefined => {
  const wanted = uri.fsPath.toLowerCase();

  return sources
    .filter((source) => wanted.startsWith(source.baseUri.fsPath.toLowerCase()))
    .sort((a, b) => b.baseUri.fsPath.length - a.baseUri.fsPath.length)
    .at(0);
};

export const getPathInSource = (source: ArchiveSource, uri: Uri): string =>
  uri.fsPath
    .slice(source.baseUri.fsPath.length)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
