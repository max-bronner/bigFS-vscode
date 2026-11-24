import { EventEmitter } from 'vscode';
import type { ExtensionContext, Uri } from 'vscode';
import { registerCommand } from '../../platform/commands';
import { setContextKey } from '../../platform/contextKeys';
import type { Services } from '../../services/createServices';
import { AssetCatalogueEditorProvider } from './assetCatalogueEditorProvider';
import type { CatalogueChange } from './catalogueChange';
import { listRestorableCatalogues } from './listRestorableCatalogues';
import { restoreAssetCatalogue } from './restoreAssetCatalogue';
import { syncAssetCatalogue } from './syncAssetCatalogue';

export const registerAssetCatalogue = (
  context: ExtensionContext,
  services: Services,
): void => {
  const { archives, log } = services;
  const changes = new EventEmitter<CatalogueChange>();
  const updateRestorable = () =>
    archives
      .whenReady()
      .then(() => listRestorableCatalogues(archives.getSources()))
      .then((paths) => setContextKey('restorableAssetCatalogues', paths))
      .catch((error: unknown) => log.error('Failed to list the restorable asset.dat files', error));

  context.subscriptions.push(
    changes,
    AssetCatalogueEditorProvider.register(context.extensionUri, archives, changes.event),
    registerCommand('bigfs.syncAssetCatalogue', (uri?: Uri) =>
      syncAssetCatalogue(services, context.extensionUri, changes, uri),
    ),
    registerCommand('bigfs.restoreAssetCatalogue', (target?: unknown) =>
      restoreAssetCatalogue(target, archives, changes),
    ),
    archives.onDidScan(updateRestorable),
    changes.event(updateRestorable),
  );
  void updateRestorable();
};
