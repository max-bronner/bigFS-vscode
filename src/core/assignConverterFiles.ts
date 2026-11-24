import { CONVERTER_FILE_TYPES } from './converterFileTypes';
import type { ConverterKind } from './converterFileTypes';

export interface GivenConverterFile<T> {
  file: T;
  name: string;
  key: string;
  folder?: string;
}

export interface ConverterAssignment<T> {
  added: Map<ConverterKind, T[]>;
  skipped: string[];
  duplicates: number;
}

const getExtension = (name: string) => {
  const dot = name.lastIndexOf('.');

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export const assignConverterFiles = <T>(
  given: readonly GivenConverterFile<T>[],
  listed: Readonly<Record<ConverterKind, readonly string[]>>,
  converter?: ConverterKind,
): ConverterAssignment<T> => {
  const added = new Map<ConverterKind, T[]>();
  const seen = new Map<ConverterKind, Set<string>>();
  const skipped: string[] = [];
  const skippedInFolder = new Map<string, number>();
  let duplicates = 0;

  for (const { file, name, key, folder } of given) {
    const extension = getExtension(name);
    const takers = (converter ? [converter] : (Object.keys(CONVERTER_FILE_TYPES) as ConverterKind[])).filter(
      (kind) => CONVERTER_FILE_TYPES[kind].extensions.includes(extension),
    );

    if (takers.length !== 1) {
      if (folder !== undefined) {
        skippedInFolder.set(folder, (skippedInFolder.get(folder) ?? 0) + 1);
      } else {
        skipped.push(takers.length ? `${name} (more than one converter takes it)` : name);
      }
      continue;
    }

    const [taker] = takers;
    const keys = seen.get(taker) ?? new Set(listed[taker]);

    seen.set(taker, keys);
    if (keys.has(key)) {
      duplicates++;
      continue;
    }
    keys.add(key);
    const files = added.get(taker) ?? [];

    files.push(file);
    added.set(taker, files);
  }

  for (const [folder, count] of skippedInFolder) {
    skipped.push(`${count} other ${count === 1 ? 'file' : 'files'} in ${folder}`);
  }
  return { added, skipped, duplicates };
};
