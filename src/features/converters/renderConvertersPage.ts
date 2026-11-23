import type { Uri, Webview } from 'vscode';
import { getPageBundleOptions } from '../../platform/webview/pageBundle';
import { renderWebviewPage } from '../../platform/webview/webviewPage';

const STYLE = `
  body { padding: 0 10px 10px; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  .card { padding: 8px 0 10px; border-bottom: 1px solid var(--vscode-panel-border, #8884); }
  h3 { margin: 4px 0; font-size: 1em; }
  .about { margin: 0 0 6px; opacity: 0.8; }
  .choice { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .choice span { min-width: 64px; opacity: 0.85; }
  .choice select { flex: 1; min-width: 0; }
  select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent); padding: 2px; font: inherit; }
  button { margin-top: 6px; padding: 3px 10px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; cursor: pointer; font: inherit; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .log { margin-top: 6px; max-height: 8em; overflow: auto; opacity: 0.85; font-size: 0.92em; }
  .log .error { color: var(--vscode-errorForeground); }
  [hidden] { display: none !important; }
`;

export const renderConvertersPage = (webview: Webview, extensionUri: Uri): string =>
  renderWebviewPage({
    style: STYLE,
    body: '',
    ...getPageBundleOptions(extensionUri, webview, 'converters'),
  });
