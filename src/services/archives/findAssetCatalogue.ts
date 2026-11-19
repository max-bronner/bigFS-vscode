import { FileType, Uri, workspace } from 'vscode';
import { ASSET_CATALOGUE_NAME } from '../../formats/asset/assetCatalogue';
import type { ArchiveSource } from './archiveSource';

export const findAssetCatalogue = async (
  source: ArchiveSource,
): Promise<Uri | undefined> => {
  if (source.baseUri.scheme !== 'file') {
    return undefined;
  }

  const uri = Uri.joinPath(source.baseUri, ASSET_CATALOGUE_NAME);

  try {
    return (await workspace.fs.stat(uri)).type === FileType.File ? uri : undefined;
  } catch {
    return undefined;
  }
};
