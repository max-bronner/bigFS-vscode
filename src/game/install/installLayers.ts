export type InstallKind = 'rotwk' | 'bfme2' | 'mod';

const INSTALL_MARKERS: readonly { kind: InstallKind; file: string }[] = [
  { kind: 'rotwk', file: 'lotrbfme2ep1.exe' },
  { kind: 'bfme2', file: 'lotrbfme2.exe' },
];

export const isInsideSource = (candidate: string, folder: string): boolean => {
  const normalise = (text: string) =>
    text.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const wanted = normalise(candidate);
  const base = normalise(folder);

  return wanted === base || wanted.startsWith(`${base}/`);
};

export interface LayerTraits {
  kind: InstallKind;
  base: boolean;
}

export const detectInstallKind = (fileNames: Iterable<string>): InstallKind => {
  const names = new Set(Array.from(fileNames, (name) => name.toLowerCase()));

  return INSTALL_MARKERS.find(({ file }) => names.has(file))?.kind ?? 'mod';
};

export const getLayerRank = ({ kind, base }: LayerTraits): number => {
  if (kind === 'rotwk') {
    return 1;
  }
  if (kind === 'bfme2') {
    return 2;
  }
  return base ? 3 : 0;
};

export const orderLayers = <T extends LayerTraits>(layers: readonly T[]): T[] =>
  layers
    .map((layer, position) => ({ layer, position }))
    .sort(
      (a, b) =>
        getLayerRank(a.layer) - getLayerRank(b.layer) || a.position - b.position,
    )
    .map(({ layer }) => layer);

export type GameId = 'bfme2' | 'rotwk';

export interface StackTraits extends LayerTraits {
  game?: GameId;
}

export const getDefaultGame = (layers: readonly StackTraits[]): GameId =>
  layers.some((layer) => layer.kind === 'rotwk') ? 'rotwk' : 'bfme2';

export const buildStacks = <T extends StackTraits>(
  layers: readonly T[],
): Map<T, T[]> => {
  const findInstall = (kind: GameId) =>
    layers.find((layer) => layer.kind === kind && layer.base) ??
    layers.find((layer) => layer.kind === kind);
  const rotwk = findInstall('rotwk');
  const bfme2 = findInstall('bfme2');
  const unmarkedBases = layers.filter(
    (layer) => layer.kind === 'mod' && layer.base,
  );
  const defaultGame = getDefaultGame(layers);
  const stacks = new Map<T, T[]>();

  for (const layer of layers) {
    let beneath: (T | undefined)[];

    if (layer.kind === 'bfme2') {
      beneath = [];
    } else if (layer.kind === 'rotwk') {
      beneath = [bfme2];
    } else if (layer.base) {
      beneath = [];
    } else {
      beneath = [
        ...((layer.game ?? defaultGame) === 'rotwk' ? [rotwk, bfme2] : [bfme2]),
        ...unmarkedBases,
      ];
    }

    stacks.set(layer, [
      ...new Set([layer, ...beneath.filter((each): each is T => !!each)]),
    ]);
  }

  return stacks;
};

export const parseRegistryPath = (stdout: string): string | undefined => {
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/.exec(line);

    if (match) {
      return match[1];
    }
  }

  return undefined;
};
