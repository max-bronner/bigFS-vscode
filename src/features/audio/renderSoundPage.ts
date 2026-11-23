import * as vscode from 'vscode';
import { renderWebviewPage } from '../../platform/webview/webviewPage';

export const renderSoundPage = (webview: vscode.Webview, scripts: vscode.Uri): string => {
  return renderWebviewPage({
    allow: { script: webview.cspSource },
    scriptFiles: [
      webview.asWebviewUri(vscode.Uri.joinPath(scripts, 'sound.js')).toString(),
    ],
    style: `
  body { padding: 10px; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  ul { list-style: none; padding: 0; }
  li { margin: 2px 0; }
  #start { display: block; width: 100%; margin: 10px 0; padding: 14px 10px; border: none; cursor: pointer; font: inherit; font-size: 1.2em; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  #start:focus { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  #start[hidden] { display: none; }
  .muted { opacity: 0.7; }
`,
    body: `<strong id="status">Nothing played yet</strong>
<button id="start" hidden></button>
<div class="muted">Played before; Ctrl+click opens the file</div>
<ul id="history"></ul>`,
  });
};
