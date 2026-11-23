import { ASSET_KINDS } from '../../formats/asset/assetCatalogue';
import { readW3dAssetEntries } from '../../formats/asset/readW3dAssetEntries';

export const listModelSubObjects = (bytes: Uint8Array): string[] =>
  readW3dAssetEntries(bytes)
    .entries.filter((entry) => entry.kind === ASSET_KINDS.MESH || entry.kind === ASSET_KINDS.BOX)
    .map((entry) => entry.name);
