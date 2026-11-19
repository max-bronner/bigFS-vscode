import * as vscode from 'vscode';

export const applyRegionEdit = async (
  document: vscode.TextDocument,
  change: vscode.WorkspaceEdit,
  line: number,
): Promise<boolean> => {
  const applied = await vscode.workspace.applyEdit(change);

  if (
    applied &&
    !vscode.window.visibleTextEditors.some(
      (editor) => editor.document === document,
    )
  ) {
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: false,
      selection: new vscode.Range(line, 0, line, 0),
    });
  }
  return applied;
};
