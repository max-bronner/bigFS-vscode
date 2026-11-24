import type { Uri, Webview } from 'vscode';
import { getPageBundleOptions } from '../../platform/webview/pageBundle';
import { renderWebviewPage } from '../../platform/webview/webviewPage';

const STYLE = `
  body { padding: 4px 10px 10px; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  .card { margin: 8px 0; padding: 8px 10px 10px; border: 1px solid var(--vscode-panel-border, #8884); border-radius: 4px; }
  h3 { margin: 2px 0 4px; font-size: 1em; }
  .about { margin: 0 0 6px; opacity: 0.8; }
  .files-box { margin: 6px 0 2px; border: 1px solid var(--vscode-panel-border, #8884); border-radius: 3px; }
  .files-box.empty { border-style: dashed; }
  .files-box .empty { margin: 0; padding: 3px 8px; font-size: 0.92em; opacity: 0.6; }
  .files { margin: 0; padding: 2px; list-style: none; max-height: calc(6 * 22px + 4px); overflow: auto; }
  .files li { display: flex; align-items: center; gap: 6px; height: 22px; padding: 0 0 0 6px; border-radius: 3px; }
  .files li:hover { background: var(--vscode-list-hoverBackground); }
  .files .name { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .files .folder { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9em; opacity: 0.6; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .note { margin: 6px 0 0; font-size: 0.92em; opacity: 0.8; }
  .note:empty { display: none; }
  button { padding: 3px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; cursor: pointer; font: inherit; }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-button-border, #8886); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.link, button.remove { padding: 0 4px; color: var(--vscode-textLink-foreground); background: none; }
  button.link:hover, button.remove:hover { background: none; text-decoration: underline; }
  button.remove { color: var(--vscode-foreground); opacity: 0.7; font-size: 1.1em; }
  [hidden] { display: none !important; }
`;

export const renderConvertersPage = (webview: Webview, extensionUri: Uri): string =>
  renderWebviewPage({
    style: STYLE,
    body: '',
    ...getPageBundleOptions(extensionUri, webview, 'converters'),
  });
