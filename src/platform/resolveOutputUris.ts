import * as vscode from 'vscode';
import { formatCount } from '../core/messages';

export const resolveOutputUris = async (
  sources: readonly vscode.Uri[],
  names: readonly string[],
  output: unknown,
  canWriteBeside: (uri: vscode.Uri) => boolean,
): Promise<vscode.Uri[] | undefined> => {
  const isBeside = (uri: vscode.Uri) => output === 'beside' && canWriteBeside(uri);
  let folder: vscode.Uri | undefined;

  if (sources.some((uri) => !isBeside(uri))) {
    [folder] =
      (await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: 'Write Here',
        title: 'Folder for the converted files',
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      })) ?? [];
    if (!folder) {
      return undefined;
    }
  }

  const outputs = sources.map((uri, at) =>
    isBeside(uri)
      ? vscode.Uri.joinPath(uri, '..', names[at])
      : vscode.Uri.joinPath(folder!, names[at]),
  );
  const existing = await Promise.all(
    outputs.map((uri) =>
      Promise.resolve(vscode.workspace.fs.stat(uri)).then(
        () => true,
        () => false,
      ),
    ),
  );
  const count = existing.filter(Boolean).length;

  if (
    count &&
    (await vscode.window.showWarningMessage(
      count === 1
        ? `${outputs[existing.indexOf(true)].path.split('/').pop()} already exists. Replace it?`
        : `${formatCount(count, 'file')} already there. Replace them?`,
      { modal: true },
      'Replace',
    )) !== 'Replace'
  ) {
    return undefined;
  }
  return outputs;
};
