import { Uri } from 'vscode';
import type { Webview } from 'vscode';

export const pageBundleFolder = (extensionUri: Uri): Uri =>
  Uri.joinPath(extensionUri, 'dist', 'webview');

export const pageBundle = (
  extensionUri: Uri,
  webview: Webview,
  name: string,
): { allow: { script: string }; scriptFiles: string[] } => ({
  allow: { script: webview.cspSource },
  scriptFiles: [
    webview
      .asWebviewUri(Uri.joinPath(pageBundleFolder(extensionUri), `${name}.js`))
      .toString(),
  ],
});
