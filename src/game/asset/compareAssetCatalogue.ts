import type { AssetRecord } from '../../formats/asset/assetCatalogue';
import { describeAssetPath, getAssetKey } from '../../formats/asset/assetPaths';
import type { AssetPath } from '../../formats/asset/assetPaths';
import type { W3dAssetContents } from '../../formats/asset/readW3dAssetEntries';

export interface AssetCandidate<T> {
  entryPath: string;
  ref: T;
  isOwned: boolean;
}

export interface AssetFile<T> extends AssetPath {
  entryPath: string;
  ref: T;
  isOwned: boolean;
}

export interface RecordCheck<T> {
  record: AssetRecord;
  file: AssetFile<T>;
}

export interface AssetComparison<T> {
  missing: AssetFile<T>[];
  gone: AssetRecord[];
  toCheck: RecordCheck<T>[];
}

export const findCatalogueLayer = (
  hasCatalogue: readonly boolean[],
  layer: number,
): number | undefined => {
  for (let index = layer; index < hasCatalogue.length; index++) {
    if (hasCatalogue[index]) {
      return index;
    }
  }

  return undefined;
};

export const compareAssetCatalogue = <T>(
  records: readonly AssetRecord[],
  candidates: Iterable<AssetCandidate<T>>,
): AssetComparison<T> => {
  const files = new Map<string, AssetFile<T>>();

  for (const candidate of candidates) {
    const path = describeAssetPath(candidate.entryPath);
    const held = path && files.get(path.key);

    if (path && (!held || path.rank < held.rank)) {
      files.set(path.key, { ...path, ...candidate });
    }
  }

  const recordKeys = new Set<string>();
  const comparison: AssetComparison<T> = { missing: [], gone: [], toCheck: [] };

  for (const record of records) {
    const key = getAssetKey(record.name);
    const file = key === undefined ? undefined : files.get(key);

    if (key !== undefined) {
      recordKeys.add(key);
    }

    if (!file) {
      comparison.gone.push(record);
    } else if (file.kind === 'model' && file.isOwned) {
      comparison.toCheck.push({ record, file });
    }
  }

  for (const [key, file] of files) {
    if (file.isOwned && !recordKeys.has(key)) {
      comparison.missing.push(file);
    }
  }

  return comparison;
};

export const isRecordStale = (
  record: AssetRecord,
  contents: W3dAssetContents,
): boolean =>
  record.entries.length !== contents.entries.length ||
  record.entries.some((entry, index) => {
    const read = contents.entries[index];

    return (
      entry.kind !== read.kind ||
      entry.offset !== read.offset ||
      entry.size !== read.size ||
      entry.name.toLowerCase() !== read.name.toLowerCase()
    );
  });
