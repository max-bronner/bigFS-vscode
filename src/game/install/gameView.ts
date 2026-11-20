export interface GameFile<T> {
  entryPath: string;
  ref: T;
  origin: string;
}

export interface GameNode<T> {
  name: string;
  path: string;
  children?: Map<string, GameNode<T>>;
  winner?: GameFile<T>;
  rank?: number;
  shadowed?: GameFile<T>[];
}

export const getArchiveOrderKey = (pathInInstall: string): string =>
  pathInInstall.toLowerCase().replace(/\//g, '\\');

export const buildGameTree = <T>(files: Iterable<GameFile<T>>): GameNode<T> => {
  const root: GameNode<T> = { name: '', path: '', children: new Map() };
  let rank = -1;

  for (const file of files) {
    rank += 1;
    const segments = file.entryPath.split('/').filter(Boolean);
    let node: GameNode<T> | undefined = root;

    for (const [index, segment] of segments.entries()) {
      const key = segment.toLowerCase();
      const isLeaf = index === segments.length - 1;
      let child: GameNode<T> | undefined = node.children?.get(key);

      if (!child) {
        child = {
          name: segment,
          path: node.path ? `${node.path}/${key}` : key,
          ...(isLeaf ? {} : { children: new Map() }),
        };
        node.children?.set(key, child);
      }

      if (isLeaf === Boolean(child.children)) {
        node = undefined;
        break;
      }

      node = child;
    }

    if (!node || node === root) {
      continue;
    }

    if (node.winner) {
      node.shadowed = [...(node.shadowed ?? []), file];
    } else {
      node.winner = file;
      node.rank = rank;
    }
  }

  return root;
};

export const compareArchivePaths = (a: string, b: string): number => {
  const keyA = getArchiveOrderKey(a);
  const keyB = getArchiveOrderKey(b);

  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
};

export interface LoadPosition {
  layer: number;
  archive?: string;
}

export const compareLoadPositions = (a: LoadPosition, b: LoadPosition): number =>
  a.layer - b.layer ||
  (a.archive === undefined ? 0 : 1) - (b.archive === undefined ? 0 : 1) ||
  compareArchivePaths(a.archive ?? '', b.archive ?? '');

export interface InstallFiles<T> {
  loose: GameFile<T>[];
  archives: { pathInInstall: string; files: GameFile<T>[] }[];
}

export const orderInstallFiles = <T>(
  installs: readonly InstallFiles<T>[],
): GameFile<T>[] =>
  installs.flatMap((install) => [
    ...install.loose,
    ...[...install.archives]
      .sort((a, b) => compareArchivePaths(a.pathInInstall, b.pathInInstall))
      .flatMap((archive) => archive.files),
  ]);

export const indexByName = <T>(root: GameNode<T>): Map<string, GameNode<T>> => {
  const byName = new Map<string, GameNode<T>>();

  for (const node of getGameFiles(root)) {
    const name = node.path.slice(node.path.lastIndexOf('/') + 1);
    const held = byName.get(name);

    if (!held || (node.rank ?? 0) < (held.rank ?? 0)) {
      byName.set(name, node);
    }
  }

  return byName;
};

export const getGameFiles = <T>(node: GameNode<T>): GameNode<T>[] =>
  node.children
    ? Array.from(node.children.values()).flatMap(getGameFiles)
    : node.winner
      ? [node]
      : [];
