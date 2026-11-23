export type DetailLevel = 'high' | 'medium' | 'low';

export const DETAIL_LEVELS: readonly DetailLevel[] = ['high', 'medium', 'low'];

const SUFFIX: Record<DetailLevel, string> = { high: '', medium: 'M', low: 'L' };

export const getDetailModel = (model: string, level: DetailLevel): string =>
  `${model.replace(/\.w3d$/i, '')}${SUFFIX[level]}`;

export interface DetailFiles {
  level: DetailLevel;
  files: Partial<Record<DetailLevel, string>>;
}

export const findDetailFiles = async (
  file: string,
  readHierarchy: (file: string) => Promise<string | undefined>,
): Promise<DetailFiles | undefined> => {
  const stem = file.toLowerCase().replace(/\.w3d$/, '');
  const hierarchy = (await readHierarchy(`${stem}.w3d`))?.toLowerCase();

  if (hierarchy === undefined) {
    return undefined;
  }

  const isSameRig = async (name: string) =>
    (await readHierarchy(`${name}.w3d`))?.toLowerCase() === hierarchy;
  let base = stem;
  let level: DetailLevel = 'high';

  for (const lower of ['medium', 'low'] as const) {
    const tail = SUFFIX[lower].toLowerCase();

    if (stem.endsWith(tail) && (await isSameRig(stem.slice(0, -1)))) {
      base = stem.slice(0, -1);
      level = lower;
      break;
    }
  }

  const files: DetailFiles['files'] = { high: `${base}.w3d` };

  for (const lower of ['medium', 'low'] as const) {
    const name = getDetailModel(base, lower).toLowerCase();

    if (await isSameRig(name)) {
      files[lower] = `${name}.w3d`;
    }
  }
  return files.medium || files.low ? { level, files } : undefined;
};
