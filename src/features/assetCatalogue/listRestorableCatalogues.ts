import { hasOriginal } from '../../node/originalCopy';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import { findAssetCatalogue } from '../../services/archives/findAssetCatalogue';
import { canWriteCatalogue } from './chooseCatalogueTarget';

export const listRestorableCatalogues = async (
  sources: readonly ArchiveSource[],
): Promise<string[]> => {
  const paths: string[] = [];

  for (const source of sources) {
    const catalogue = await findAssetCatalogue(source);

    if (
      catalogue &&
      hasOriginal(catalogue.fsPath) &&
      (await canWriteCatalogue(catalogue, sources))
    ) {
      paths.push(catalogue.fsPath);
    }
  }

  return paths;
};
