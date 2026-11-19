import type { ExtensionContext, Uri } from 'vscode';
import { registerCommand } from '../../platform/commands';
import type { Services } from '../../services/createServices';
import { AssetCatalogueEditorProvider } from './assetCatalogueEditorProvider';
import { syncAssetCatalogue } from './syncAssetCatalogue';

export const registerAssetCatalogue = (
  context: ExtensionContext,
  services: Services,
): void => {
  context.subscriptions.push(
    AssetCatalogueEditorProvider.register(context.extensionUri),
    registerCommand('bigfs.syncAssetCatalogue', (uri?: Uri) =>
      syncAssetCatalogue(services, context.extensionUri, uri),
    ),
  );
};
