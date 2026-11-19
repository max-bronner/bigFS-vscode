import { getVsCodeApi } from '../shared/vscodeApi';
import { renderCatalogueView } from './catalogueView';
import { renderSyncView } from './syncView';
import type { SyncView } from './syncView';
import type { FromAssetCataloguePage, ToAssetCataloguePage } from './protocol';

const vscode = getVsCodeApi<FromAssetCataloguePage>();
const root = document.getElementById('root')!;
let syncView: SyncView | undefined;

window.addEventListener('message', ({ data }: MessageEvent<ToAssetCataloguePage>) => {
  if (data.kind === 'catalogue') {
    renderCatalogueView(root, data, () => vscode.postMessage({ kind: 'sync' }));
  } else if (data.kind === 'sync') {
    syncView = renderSyncView(
      root,
      data,
      (selected) => vscode.postMessage({ kind: 'apply', selected }),
      (group, id) => vscode.postMessage({ kind: 'open', group, id }),
    );
  } else if (data.kind === 'applied' || data.kind === 'failed') {
    syncView?.showResult(data);
  }
});
vscode.postMessage({ kind: 'ready' });
