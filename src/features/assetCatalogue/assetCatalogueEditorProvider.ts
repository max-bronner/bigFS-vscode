import { commands, window, workspace } from 'vscode';
import type {
  CustomDocument,
  CustomReadonlyEditorProvider,
  Disposable,
  Uri,
  WebviewPanel,
} from 'vscode';
import { describeError } from '../../core/errors';
import { parseAssetCatalogue } from '../../formats/asset/assetCatalogue';
import type { AssetCatalogue } from '../../formats/asset/assetCatalogue';
import {
  getPageBundleFolder,
  getPageBundleOptions,
} from '../../platform/webview/pageBundle';
import type {
  CatalogueMessage,
  FromAssetCataloguePage,
} from '../../webview/assetCatalogue/protocol';
import { renderAssetCataloguePage } from './renderAssetCataloguePage';
import { toCatalogueRows } from './toCatalogueRows';

export const ASSET_CATALOGUE_VIEW_TYPE = 'bigfs.assetCatalogue';

class AssetCatalogueDocument implements CustomDocument {
  public constructor(
    public readonly uri: Uri,
    public readonly catalogue: AssetCatalogue | undefined,
    public readonly error?: string,
  ) {}

  public dispose(): void {}
}

export class AssetCatalogueEditorProvider
  implements CustomReadonlyEditorProvider<AssetCatalogueDocument>
{
  public constructor(private readonly extensionUri: Uri) {}

  public static register(extensionUri: Uri): Disposable {
    return window.registerCustomEditorProvider(
      ASSET_CATALOGUE_VIEW_TYPE,
      new AssetCatalogueEditorProvider(extensionUri),
      { supportsMultipleEditorsPerDocument: true },
    );
  }

  public async openCustomDocument(uri: Uri): Promise<AssetCatalogueDocument> {
    try {
      return new AssetCatalogueDocument(
        uri,
        parseAssetCatalogue(await workspace.fs.readFile(uri)),
      );
    } catch (error) {
      return new AssetCatalogueDocument(uri, undefined, describeError(error));
    }
  }

  public resolveCustomEditor(
    document: AssetCatalogueDocument,
    panel: WebviewPanel,
  ): void {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [getPageBundleFolder(this.extensionUri)],
    };
    panel.webview.html = renderAssetCataloguePage(
      getPageBundleOptions(this.extensionUri, panel.webview, 'assetCatalogue'),
    );
    panel.webview.onDidReceiveMessage((message: FromAssetCataloguePage) => {
      if (message?.kind === 'ready') {
        const reply: CatalogueMessage = {
          kind: 'catalogue',
          path: document.uri.fsPath || document.uri.path,
          records: document.catalogue ? toCatalogueRows(document.catalogue) : [],
          dependencies: document.catalogue?.dependencies.length ?? 0,
          error: document.error,
        };

        void panel.webview.postMessage(reply);
      } else if (message?.kind === 'sync') {
        void commands.executeCommand('bigfs.syncAssetCatalogue', document.uri);
      }
    });
  }
}
