import { stat } from 'fs/promises';
import * as path from 'path';
import type { Uri } from 'vscode';
import { listFileVersions } from '../../game/install/listFileVersions';
import type {
  FileVersions,
  StackCandidates,
  VersionCandidate,
  VersionLayer,
} from '../../game/install/listFileVersions';
import type { GameFile } from '../../game/install/gameView';
import type { ArchiveModel } from './archiveModel';
import type { ArchiveSource } from './archiveSource';
import type { GameFileRef, GameViewModel, GameViewNode } from './gameViewModel';
import { getNodeUri } from './nodeAddress';

export interface VersionRef {
  uri: Uri;
  size?: number;
  modified?: Date;
}

export interface FoundVersions {
  gamePath: string;
  versions: FileVersions<VersionRef>;
}

const toKey = (uri: Uri): string => uri.toString().toLowerCase();

const toLayer = ({ label, kind, base }: ArchiveSource): VersionLayer => ({ label, kind, base });

const getGamePath = (archives: ArchiveModel, uri: Uri): string | undefined => {
  const resolved = archives.resolveUri(uri);

  if (resolved) {
    return resolved.entryPath;
  }
  if (uri.scheme !== 'file') {
    return undefined;
  }

  const source = archives.loadOrder.findSource(uri);
  const filePath = uri.fsPath.replace(/\\/g, '/');

  if (source) {
    return path
      .relative(source.baseUri.fsPath, uri.fsPath)
      .replace(/\\/g, '/');
  }

  const data = filePath.toLowerCase().lastIndexOf('/data/');

  return data < 0 ? undefined : filePath.slice(data + 1);
};

const findGameNode = (root: GameViewNode, gamePath: string): GameViewNode | undefined =>
  gamePath
    .toLowerCase()
    .split('/')
    .filter(Boolean)
    .reduce<GameViewNode | undefined>((node, segment) => node?.children?.get(segment), root);

export const findFileVersions = async (
  archives: ArchiveModel,
  gameView: GameViewModel,
  uri: Uri,
): Promise<FoundVersions | undefined> => {
  const gamePath = getGamePath(archives, uri);

  if (!gamePath) {
    return undefined;
  }

  const { loadOrder } = archives;
  const sources = archives.getSources();

  const toCandidate = async (
    file: GameFile<GameFileRef>,
  ): Promise<VersionCandidate<VersionRef> | undefined> => {
    const { ref } = file;

    if (ref.kind === 'entry') {
      const { node } = ref;
      const source = sources.find(({ id }) => id === node.archive.sourceId);
      const entryUri = getNodeUri(node);

      return source && {
        ref: { uri: entryUri, size: archives.getFileSize(node) },
        key: toKey(entryUri),
        archive: node.archive.pathInSource,
        layer: toLayer(source),
      };
    }

    const source = loadOrder.findSource(ref.uri);
    const facts = await stat(ref.uri.fsPath).catch(() => undefined);

    return source && {
      ref: { uri: ref.uri, size: facts?.size, modified: facts?.mtime },
      key: toKey(ref.uri),
      layer: toLayer(source),
    };
  };

  const listStack = async (
    stack: readonly ArchiveSource[],
    from: Uri,
  ): Promise<StackCandidates<VersionRef> | undefined> => {
    if (!stack[0]) {
      return undefined;
    }

    const node = findGameNode(await gameView.getRoot(from), gamePath);
    const files = node?.winner ? [node.winner, ...(node.shadowed ?? [])] : [];
    const copies = await Promise.all(files.map(toCandidate));

    return {
      top: toLayer(stack[0]),
      copies: copies.filter((copy): copy is VersionCandidate<VersionRef> => !!copy),
    };
  };

  const ownStack = loadOrder.getStack(uri);
  const covered = new Set(ownStack);
  const stacks = [await listStack(ownStack, uri)];

  for (const source of sources) {
    const stack = loadOrder.getStack(source.baseUri);

    if (stack.every((layer) => covered.has(layer))) {
      continue;
    }

    stack.forEach((layer) => covered.add(layer));
    stacks.push(await listStack(stack, source.baseUri));
  }

  return {
    gamePath,
    versions: listFileVersions(
      stacks.filter((stack): stack is StackCandidates<VersionRef> => !!stack),
      toKey(uri),
    ),
  };
};

export const findVersionSide = (
  archives: ArchiveModel,
  uri: Uri,
): Pick<VersionCandidate<VersionRef>, 'archive' | 'layer'> | undefined => {
  const resolved = archives.resolveUri(uri);
  const sources = archives.getSources();

  if (resolved) {
    const source = sources.find(({ id }) => id === resolved.archive.sourceId);

    return source && { archive: resolved.archive.pathInSource, layer: toLayer(source) };
  }

  const source = uri.scheme === 'file' ? archives.loadOrder.findSource(uri) : undefined;

  return source && { layer: toLayer(source) };
};
