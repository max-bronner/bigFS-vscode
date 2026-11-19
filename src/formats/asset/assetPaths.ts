export type AssetFileKind = 'model' | 'shader' | 'texture';

export interface AssetPath {
  key: string;
  kind: AssetFileKind;
  name: string;
  rank: number;
}

const TEXTURE_EXTENSIONS = ['dds', 'tga', 'jpg', 'png'];
const APT_PREFIX = 'apt_';

const splitName = (name: string): { stem: string; extension: string } | undefined => {
  const dot = name.lastIndexOf('.');

  return dot > 0 && !/[\\/]/.test(name)
    ? { stem: name.slice(0, dot), extension: name.slice(dot + 1).toLowerCase() }
    : undefined;
};

const getKind = (extension: string): AssetFileKind =>
  extension === 'w3d' ? 'model' : extension === 'fx' ? 'shader' : 'texture';

export const getAssetKey = (recordName: string): string | undefined => {
  const parts = splitName(recordName);

  return parts && `${getKind(parts.extension)}:${parts.stem.toLowerCase()}`;
};

export const describeAssetPath = (entryPath: string): AssetPath | undefined => {
  const segments = entryPath.split('/');
  const fileName = segments.at(-1) ?? '';
  const parts = splitName(fileName);

  if (!parts) {
    return undefined;
  }

  const { stem, extension } = parts;
  const lowerStem = stem.toLowerCase();
  const folder = segments.slice(0, -1).join('/').toLowerCase();
  const prefixFolder = lowerStem.slice(0, 2);

  if (extension === 'w3d') {
    const rank =
      folder === `art/w3d/${prefixFolder}`
        ? 0
        : folder === 'data/editor/molds'
          ? 1
          : -1;

    return rank < 0
      ? undefined
      : { key: `model:${lowerStem}`, kind: 'model', name: `${stem}.w3d`, rank };
  }

  if (extension === 'fxo') {
    return folder === 'shaders/compiled'
      ? { key: `shader:${lowerStem}`, kind: 'shader', name: `${stem}.fx`, rank: 0 }
      : undefined;
  }

  const rank = TEXTURE_EXTENSIONS.indexOf(extension);
  const textureFolder = lowerStem.startsWith(APT_PREFIX)
    ? 'art/textures'
    : `art/compiledtextures/${prefixFolder}`;

  return rank >= 0 && folder === textureFolder
    ? { key: `texture:${lowerStem}`, kind: 'texture', name: `${stem}.tga`, rank }
    : undefined;
};
