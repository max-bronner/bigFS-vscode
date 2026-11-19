import * as vscode from 'vscode';
import type { EntryLocator } from '../../services/entryLocator';
import { PREVIEW_VIEW_TYPE } from '../../constants';
import { findAssetReferences } from '../../formats/ini/sageIniAssets';
import type { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import { registerCommand } from '../../platform/commands';

const isBuiltInPreview = (uri: vscode.Uri) =>
  /\.(mp3|jpe?g|png)$/i.test(uri.path);

const createAssetLinkProvider = (
  documents: SageIniDocuments,
): vscode.DocumentLinkProvider => ({
  async provideDocumentLinks(document) {
    const parsed = await documents.parse(document);

    return findAssetReferences(parsed).map((reference) => {
      const link = new vscode.DocumentLink(
        new vscode.Range(
          reference.line,
          reference.start,
          reference.line,
          reference.end,
        ),
        vscode.Uri.parse(
          `command:bigfs.openAsset?${encodeURIComponent(
            JSON.stringify([reference.candidates, document.uri.toString()]),
          )}`,
        ),
      );

      link.tooltip = `Open ${reference.candidates[0]}`;
      return link;
    });
  },
});

export const registerAssetLinks = (
  selector: vscode.DocumentSelector,
  documents: SageIniDocuments,
  locator: EntryLocator,
): vscode.Disposable[] => [
  vscode.languages.registerDocumentLinkProvider(
    selector,
    createAssetLinkProvider(documents),
  ),
  registerCommand(
    'bigfs.openAsset',
    async (candidates: string[], near: string) => {
      for (const candidate of candidates) {
        const uri = await locator.findUri(candidate, vscode.Uri.parse(near));

        if (uri) {
          await (isBuiltInPreview(uri)
            ? vscode.commands.executeCommand(
                'vscode.open',
                uri,
                vscode.ViewColumn.Beside,
              )
            : vscode.commands.executeCommand(
                'vscode.openWith',
                uri,
                PREVIEW_VIEW_TYPE,
                vscode.ViewColumn.Beside,
              ));
          return;
        }
      }
      void vscode.window.showWarningMessage(
        `${candidates[0]} is in no archive or folder`,
      );
    },
  ),
];
