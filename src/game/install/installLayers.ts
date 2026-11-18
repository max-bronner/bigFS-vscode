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

export const layerRank = ({ kind, base }: LayerTraits): number => {
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
        layerRank(a.layer) - layerRank(b.layer) || a.position - b.position,
    )
    .map(({ layer }) => layer);

export const parseRegistryPath = (stdout: string): string | undefined => {
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/.exec(line);

    if (match) {
      return match[1];
    }
  }

  return undefined;
};
