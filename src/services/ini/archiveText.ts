import * as vscode from 'vscode';
import { decodeIniText, encodeWindows1252 } from '../../core/windows1252';
import type { ArchiveModel } from '../archives/archiveModel';
import { getFileNodes } from '../archives/virtualNode';
import { getNodeUri } from '../archives/nodeAddress';
import { SCHEME } from '../../constants';

export interface ArchiveTextEntry {
  uri: vscode.Uri;
  archivePath: string;
  readOnly: boolean;
}

export const isArchiveUri = (uri: vscode.Uri): boolean => uri.scheme === SCHEME;

export const listArchiveEntries = async (
  archiveModel: ArchiveModel,
  pattern: RegExp,
): Promise<ArchiveTextEntry[]> => {
  const entries: ArchiveTextEntry[] = [];

  for (const root of archiveModel.getArchiveRoots()) {
    try {
      await archiveModel.loadArchiveOf(root);
    } catch {
      continue;
    }
    for (const node of getFileNodes(root)) {
      if (pattern.test(node.entryPath)) {
        entries.push({
          uri: getNodeUri(node),
          archivePath: root.archive.archivePath,
          readOnly: archiveModel.isReadOnly(root.archive),
        });
      }
    }
  }
  return entries;
};

export const isEditable = (archiveModel: ArchiveModel, uri: vscode.Uri) =>
  !isArchiveUri(uri) || !archiveModel.isReadOnlyUri(uri);

export const readEntryText = async (uri: vscode.Uri): Promise<string> =>
  decodeIniText(await vscode.workspace.fs.readFile(uri));

export interface SavedText {
  uri: vscode.Uri;
  before: Uint8Array;
}

export const saveEntryTexts = async (
  archiveModel: ArchiveModel,
  texts: readonly { uri: vscode.Uri; text: string }[],
): Promise<SavedText[]> => {
  const saved: SavedText[] = [];
  const files: { uri: vscode.Uri; content: Uint8Array }[] = [];

  for (const { uri, text } of texts) {
    let before: Uint8Array | undefined;

    try {
      before = await vscode.workspace.fs.readFile(uri);
    } catch {
    }
    if (before) {
      saved.push({ uri, before });
    }
    files.push({ uri, content: encodeWindows1252(text, 0x3f) });
  }
  await archiveModel.writeFiles(files);
  return saved;
};

export const restoreEntries = (
  archiveModel: ArchiveModel,
  saved: readonly SavedText[],
): Promise<void> =>
  archiveModel.writeFiles(
    saved.map(({ uri, before }) => ({ uri, content: before })),
  );

export const offerOverride = async (
  archiveModel: ArchiveModel,
  uris: readonly vscode.Uri[],
  message: string,
): Promise<void> => {
  const nodes = uris.flatMap((uri) => archiveModel.getNode(uri) ?? []);

  if (!nodes.length) {
    void vscode.window.showWarningMessage(message);
    return;
  }

  const answer = await vscode.window.showWarningMessage(
    message,
    'Override in Folder',
  );

  if (answer === 'Override in Folder') {
    await vscode.commands.executeCommand(
      'bigfs.overrideInFolder',
      nodes[0],
      nodes,
    );
  }
};
