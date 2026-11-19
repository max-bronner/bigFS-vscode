import { fromFileTime, getAssetKindName } from '../../formats/asset/assetCatalogue';
import type { AssetCatalogue } from '../../formats/asset/assetCatalogue';
import type { CatalogueRecordRow } from '../../webview/assetCatalogue/protocol';

export const toCatalogueRows = ({
  records,
  dependencies,
}: AssetCatalogue): CatalogueRecordRow[] => {
  const references = new Map<string, number>();

  for (const dependency of dependencies) {
    const file = dependency.file.toLowerCase();

    references.set(file, (references.get(file) ?? 0) + dependency.references.length);
  }

  return records.map((record) => ({
    name: record.name,
    kinds: [...new Set(record.entries.map((entry) => getAssetKindName(entry.kind)))].join(' '),
    entries: record.entries.map((entry) => ({
      name: entry.name,
      kind: getAssetKindName(entry.kind),
      offset: entry.offset,
      size: entry.size,
    })),
    modified: fromFileTime(record.timestamp),
    bytes: record.entries.reduce((sum, entry) => sum + entry.size, 0),
    references: references.get(record.name.toLowerCase()) ?? 0,
  }));
};
