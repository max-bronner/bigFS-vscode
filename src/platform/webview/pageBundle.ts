import { Uri } from 'vscode';
import type { Webview } from 'vscode';

export const getPageBundleFolder = (extensionUri: Uri): Uri =>
  Uri.joinPath(extensionUri, 'dist', 'webview');

export const getPageBundleOptions = (
  extensionUri: Uri,
  webview: Webview,
  name: string,
): { allow: { script: string }; scriptFiles: string[] } => ({
  allow: { script: webview.cspSource },
  scriptFiles: [
    webview
      .asWebviewUri(Uri.joinPath(getPageBundleFolder(extensionUri), `${name}.js`))
      .toString(),
  ],
});
