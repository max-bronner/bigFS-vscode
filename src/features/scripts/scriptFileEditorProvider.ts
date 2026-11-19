import { answerSoundRequest } from '../../platform/webview/answerSoundRequest';
import * as vscode from 'vscode';
import { MapFile, parseMap } from '../../formats/map/mapFile';
import { markSounds } from '../../formats/map/mapScriptSounds';
import { renderWebviewPage } from '../../platform/webview/webviewPage';
import { getPageBundleOptions, getPageBundleFolder } from '../../platform/webview/pageBundle';
import type {
  FromScriptsPage,
  ScriptsMessage,
} from '../../webview/scripts/protocol';

export const SCRIPT_FILE_VIEW_TYPE = 'bigfs.scriptViewer';

class ScriptDocument implements vscode.CustomDocument {
  public constructor(
    public readonly uri: vscode.Uri,
    public readonly map: MapFile,
  ) {}

  public dispose(): void {}
}

export const renderScriptFileHtml = (
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string =>
  renderWebviewPage({
    ...getPageBundleOptions(extensionUri, webview, 'scripts'),
    style: `
  body { margin: 0; padding: 0 12px; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  h2 { font-size: 1.2em; margin: 10px 0 6px; }
  details { margin: 6px 0; } summary { cursor: pointer; }
  .muted { opacity: 0.65; }
  .problems { color: var(--vscode-editorWarning-foreground); }
  .script { margin-left: 12px; } .script .calls { margin: 0 0 4px 22px; opacity: 0.8; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; }
  button.play { padding: 0 4px; margin: 0 2px; font-size: 0.85em; cursor: pointer; }
  .script label { display: flex; gap: 4px; align-items: center; }
`,
    body: '<div id="root"></div>',
  });

export class ScriptFileEditorProvider implements vscode.CustomReadonlyEditorProvider<ScriptDocument> {
  public constructor(private readonly extensionUri: vscode.Uri) {}

  public static register(extensionUri: vscode.Uri): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      SCRIPT_FILE_VIEW_TYPE,
      new ScriptFileEditorProvider(extensionUri),
      { supportsMultipleEditorsPerDocument: true },
    );
  }

  public async openCustomDocument(uri: vscode.Uri): Promise<ScriptDocument> {
    return new ScriptDocument(
      uri,
      parseMap(await vscode.workspace.fs.readFile(uri)),
    );
  }

  public resolveCustomEditor(
    document: ScriptDocument,
    panel: vscode.WebviewPanel,
  ): void {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [getPageBundleFolder(this.extensionUri)],
    };
    panel.webview.html = renderScriptFileHtml(panel.webview, this.extensionUri);
    panel.webview.onDidReceiveMessage((message: FromScriptsPage) => {
      if (message?.kind === 'ready') {
        const scripts: ScriptsMessage = {
          kind: 'scripts',
          name: document.uri.path.split('/').pop(),
          scripts: document.map.scripts.map(markSounds),
          problems: document.map.problems,
        };

        void panel.webview.postMessage(scripts);
      } else if (message?.kind === 'playSound') {
        void answerSoundRequest(message, document.uri, (reply) =>
          panel.webview.postMessage(reply),
        );
      }
    });
  }
}
