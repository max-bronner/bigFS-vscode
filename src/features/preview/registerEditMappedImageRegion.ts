import * as vscode from 'vscode';
import { readMappedImageBlock } from '../../formats/mappedImage/mappedImageEdit';
import { registerCommand } from '../../platform/commands';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { isEditable, offerOverride } from '../../services/ini/archiveText';
import type { EntryLocator } from '../../services/entryLocator';
import type { TextureRegions } from './createTextureRegions';
import { getMappedImageRegionId } from './mappedImageRegionId';
import { openTextureRegion } from './openTextureRegion';

const HEADER = /^\s*MappedImage\s/i;

const findHeaderAtCursor = (): { uri: vscode.Uri; line: number } | undefined => {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return undefined;
  }
  for (let line = editor.selection.active.line; line >= 0; line--) {
    if (HEADER.test(editor.document.lineAt(line).text)) {
      return { uri: editor.document.uri, line };
    }
  }
  return undefined;
};

export const registerEditMappedImageRegion = (
  archives: ArchiveModel,
  locator: EntryLocator,
  regions: TextureRegions,
): vscode.Disposable =>
  registerCommand(
    'bigfs.editMappedImageRegion',
    async (uri?: vscode.Uri, line?: number) => {
      const source =
        uri && line !== undefined ? { uri, line } : findHeaderAtCursor();

      if (!source) {
        void vscode.window.showInformationMessage(
          'Put the cursor in a MappedImage block first.',
        );
        return;
      }

      const document = await vscode.workspace.openTextDocument(source.uri);
      const block = readMappedImageBlock(
        document.getText().split(/\r?\n/),
        source.line,
      );
      const texture = block?.image.texture;

      if (!block || !texture) {
        void vscode.window.showWarningMessage(
          'This MappedImage block names no Texture, or is missing its End.',
        );
        return;
      }

      let found: vscode.Uri | undefined;

      for (const name of [texture.replace(/\.[^.]*$/, '.dds'), texture]) {
        found ??= await locator.findUri(name, source.uri);
      }
      if (!found) {
        void vscode.window.showWarningMessage(
          `${texture} is in no archive or folder`,
        );
        return;
      }
      if (!isEditable(archives, source.uri)) {
        void offerOverride(
          archives,
          [source.uri],
          `${block.image.name} is in a read-only archive; its box is shown but cannot be changed. Override the file in a folder to edit it.`,
        );
      }
      await openTextureRegion(
        regions,
        found,
        getMappedImageRegionId({ ...source, name: block.image.name }),
      );
    },
  );
