import { ASSET_KINDS, compareAssetNames } from '../../formats/asset/assetCatalogue';
import type {
  AssetCatalogue,
  AssetDependency,
  AssetEntry,
  AssetRecord,
  FileTime,
} from '../../formats/asset/assetCatalogue';
import type { AssetFileKind } from '../../formats/asset/assetPaths';
import type { W3dAssetContents } from '../../formats/asset/readW3dAssetEntries';

export interface RecordUpdate {
  name: string;
  kind: AssetFileKind;
  timestamp: FileTime;
  contents?: W3dAssetContents;
}

export interface AssetChanges {
  put: readonly RecordUpdate[];
  remove: readonly string[];
}

const WHOLE_FILE_KINDS: Record<Exclude<AssetFileKind, 'model'>, number> = {
  texture: ASSET_KINDS.TEX,
  shader: ASSET_KINDS.FXSH,
};

const getEntries = ({ name, kind, contents }: RecordUpdate): AssetEntry[] =>
  kind === 'model'
    ? (contents?.entries ?? [])
    : [{ name: name.toLowerCase(), kind: WHOLE_FILE_KINDS[kind], offset: 0, size: 0 }];

export const applyAssetChanges = (
  catalogue: AssetCatalogue,
  { put, remove }: AssetChanges,
): AssetCatalogue => {
  const replaced = new Set(
    [...remove, ...put.map((update) => update.name)].map((name) => name.toLowerCase()),
  );
  const removed = new Set(remove.map((name) => name.toLowerCase()));
  const records: AssetRecord[] = [
    ...catalogue.records.filter((record) => !replaced.has(record.name.toLowerCase())),
    ...put
      .filter((update) => !removed.has(update.name.toLowerCase()))
      .map((update) => ({
        name: update.name,
        timestamp: update.timestamp,
        entries: getEntries(update),
      })),
  ].sort((a, b) => compareAssetNames(a.name, b.name));

  const knownNames = new Set(
    records.flatMap((record) => [
      record.name.toLowerCase(),
      ...record.entries.map((entry) => entry.name.toLowerCase()),
    ]),
  );
  const dependenciesByFile = new Map<string, AssetDependency[]>();
  const addDependency = (dependency: AssetDependency) => {
    const file = dependency.file.toLowerCase();

    dependenciesByFile.set(file, [...(dependenciesByFile.get(file) ?? []), dependency]);
  };

  catalogue.dependencies
    .filter((dependency) => !replaced.has(dependency.file.toLowerCase()))
    .forEach(addDependency);

  for (const update of put) {
    if (removed.has(update.name.toLowerCase())) {
      continue;
    }

    for (const { subAsset, names } of update.contents?.references ?? []) {
      const references = [...new Set(names)]
        .filter((name) => knownNames.has(name))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      if (references.length) {
        addDependency({ file: update.name.toLowerCase(), subAsset, references });
      }
    }
  }

  const dependencies = records.flatMap((record) => {
    const file = record.name.toLowerCase();
    const owned = dependenciesByFile.get(file) ?? [];

    dependenciesByFile.delete(file);

    return owned;
  });

  for (const orphans of dependenciesByFile.values()) {
    dependencies.push(...orphans);
  }

  return { version: catalogue.version, records, dependencies };
};
