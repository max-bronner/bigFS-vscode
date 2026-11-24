import { commands, window, workspace } from 'vscode';
import type {
  CustomDocument,
  CustomReadonlyEditorProvider,
  Disposable,
  Event,
  Uri,
  WebviewPanel,
} from 'vscode';
import { describeError } from '../../core/errors';
import { parseAssetCatalogue } from '../../formats/asset/assetCatalogue';
import type { AssetCatalogue } from '../../formats/asset/assetCatalogue';
import { getOriginalTime } from '../../node/originalCopy';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import {
  getPageBundleFolder,
  getPageBundleOptions,
} from '../../platform/webview/pageBundle';
import type {
  CatalogueMessage,
  FromAssetCataloguePage,
} from '../../webview/assetCatalogue/protocol';
import { isChangeOf } from './catalogueChange';
import type { CatalogueChange } from './catalogueChange';
import { canWriteCatalogue } from './chooseCatalogueTarget';
import { renderAssetCataloguePage } from './renderAssetCataloguePage';
import { toCatalogueRows } from './toCatalogueRows';

export const ASSET_CATALOGUE_VIEW_TYPE = 'bigfs.assetCatalogue';

interface CatalogueReading {
  catalogue?: AssetCatalogue;
  error?: string;
}

const readCatalogue = async (uri: Uri): Promise<CatalogueReading> => {
  try {
    return { catalogue: parseAssetCatalogue(await workspace.fs.readFile(uri)) };
  } catch (error) {
    return { error: describeError(error) };
  }
};

class AssetCatalogueDocument implements CustomDocument {
  public constructor(
    public readonly uri: Uri,
    public reading: CatalogueReading,
  ) {}

  public dispose(): void {}
}

export class AssetCatalogueEditorProvider
  implements CustomReadonlyEditorProvider<AssetCatalogueDocument>
{
  public constructor(
    private readonly extensionUri: Uri,
    private readonly archives: ArchiveModel,
    private readonly onDidChangeCatalogue: Event<CatalogueChange>,
  ) {}

  public static register(
    extensionUri: Uri,
    archives: ArchiveModel,
    onDidChangeCatalogue: Event<CatalogueChange>,
  ): Disposable {
    return window.registerCustomEditorProvider(
      ASSET_CATALOGUE_VIEW_TYPE,
      new AssetCatalogueEditorProvider(extensionUri, archives, onDidChangeCatalogue),
      { supportsMultipleEditorsPerDocument: true },
    );
  }

  public async openCustomDocument(uri: Uri): Promise<AssetCatalogueDocument> {
    return new AssetCatalogueDocument(uri, await readCatalogue(uri));
  }

  public resolveCustomEditor(
    document: AssetCatalogueDocument,
    panel: WebviewPanel,
  ): void {
    const { uri } = document;
    const postCatalogue = async () => {
      const { catalogue, error } = document.reading;
      const originalTime =
        uri.scheme === 'file' && (await canWriteCatalogue(uri, this.archives.getSources()))
          ? await getOriginalTime(uri.fsPath)
          : undefined;
      const reply: CatalogueMessage = {
        kind: 'catalogue',
        path: uri.fsPath || uri.path,
        records: catalogue ? toCatalogueRows(catalogue) : [],
        dependencies: catalogue?.dependencies.length ?? 0,
        error,
        originalTime,
      };

      void panel.webview.postMessage(reply);
    };
    const subscription = this.onDidChangeCatalogue(async (change) => {
      if (isChangeOf(change, uri)) {
        document.reading = await readCatalogue(uri);
        await postCatalogue();
      }
    });

    panel.onDidDispose(() => subscription.dispose());
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [getPageBundleFolder(this.extensionUri)],
    };
    panel.webview.html = renderAssetCataloguePage(
      getPageBundleOptions(this.extensionUri, panel.webview, 'assetCatalogue'),
    );
    panel.webview.onDidReceiveMessage((message: FromAssetCataloguePage) => {
      if (message?.kind === 'ready') {
        void postCatalogue();
      } else if (message?.kind === 'sync') {
        void commands.executeCommand('bigfs.syncAssetCatalogue', uri);
      } else if (message?.kind === 'restore') {
        void commands.executeCommand('bigfs.restoreAssetCatalogue', uri);
      }
    });
  }
}
