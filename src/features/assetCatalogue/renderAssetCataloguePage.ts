import { renderWebviewPage } from '../../platform/webview/webviewPage';
import type { WebviewPage } from '../../platform/webview/webviewPage';

export const renderAssetCataloguePage = (
  bundle: Pick<WebviewPage, 'allow' | 'scriptFiles'>,
): string =>
  renderWebviewPage({
    ...bundle,
    style: `
  body { margin: 0; padding: 0 12px 12px; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  h2 { font-size: 1.15em; margin: 10px 0 6px; word-break: break-all; }
  .muted { opacity: 0.7; }
  .problem { color: var(--vscode-errorForeground); }
  .toolbar { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
  button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: none; padding: 4px 10px; cursor: pointer; }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  input[type=search] { flex: 1; min-width: 160px; max-width: 360px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 3px 6px; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; cursor: pointer; user-select: none; border-bottom: 1px solid var(--vscode-panel-border); padding: 4px 6px; position: sticky; top: 0; background: var(--vscode-editor-background); }
  td { padding: 2px 6px; vertical-align: top; }
  .number { text-align: right; font-variant-numeric: tabular-nums; }
  tr.record { cursor: pointer; }
  .link:hover { text-decoration: underline; color: var(--vscode-textLink-foreground); }
  tr.record:hover { background: var(--vscode-list-hoverBackground); }
  tr.entries > td { padding: 0 6px 6px 24px; }
  tr.entries table { width: auto; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; }
  .kind { opacity: 0.7; }
  details.group { margin: 10px 0; }
  details.group > summary { cursor: pointer; font-weight: 600; }
  .rows { display: flex; flex-direction: column; gap: 1px; margin-left: 20px; }
  label.row { display: flex; gap: 10px; align-items: baseline; }
  label.row .path { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; opacity: 0.8; }
  .status { min-height: 1.2em; }
`,
    body: '<div id="root"></div>',
  });
