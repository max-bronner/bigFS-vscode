import type { Uri } from 'vscode';
import { getGameFiles } from '../../game/install/gameView';
import type { GameFile } from '../../game/install/gameView';
import { findCatalogueLayer } from '../../game/asset/compareAssetCatalogue';
import type { AssetCandidate } from '../../game/asset/compareAssetCatalogue';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { findSourceFor } from '../../services/archives/archiveSource';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import { findAssetCatalogue } from '../../services/archives/findAssetCatalogue';
import type {
  GameFileRef,
  GameViewModel,
} from '../../services/archives/gameViewModel';

export interface CatalogueScope {
  source: ArchiveSource;
  candidates: AssetCandidate<GameFile<GameFileRef>>[];
}

export const collectAssetCandidates = async (
  catalogue: Uri,
  archives: ArchiveModel,
  gameView: GameViewModel,
): Promise<CatalogueScope | undefined> => {
  const sources = archives.getSources();
  const source = findSourceFor(sources, catalogue);

  if (!source) {
    return undefined;
  }

  const layer = sources.indexOf(source);
  const hasCatalogue = await Promise.all(
    sources.map(async (candidate, index) =>
      index === layer ? true : Boolean(await findAssetCatalogue(candidate)),
    ),
  );
  const isOwned = (ref: GameFileRef): boolean => {
    const fileSource =
      ref.kind === 'entry'
        ? sources.find((candidate) => candidate.id === ref.node.archive.sourceId)
        : findSourceFor(sources, ref.uri);

    return (
      fileSource !== undefined &&
      findCatalogueLayer(hasCatalogue, sources.indexOf(fileSource)) === layer
    );
  };
  const winners = getGameFiles(await gameView.getRoot()).map((node) => node.winner!);

  return {
    source,
    candidates: winners.map((file) => ({
      entryPath: file.entryPath,
      ref: file,
      isOwned: isOwned(file.ref),
    })),
  };
};
