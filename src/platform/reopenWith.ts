import * as vscode from 'vscode';

export const reopenWith = async (
  uri: vscode.Uri,
  viewType: string,
  column?: vscode.ViewColumn,
): Promise<void> => {
  const stale = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      ({ input }) =>
        input instanceof vscode.TabInputCustom &&
        input.viewType === viewType &&
        input.uri.toString() === uri.toString(),
    );

  if (stale.length) {
    await vscode.window.tabGroups.close(stale, true);
  }
  await vscode.commands.executeCommand(
    'vscode.openWith',
    uri,
    viewType,
    column === undefined ? undefined : { viewColumn: column, preserveFocus: true },
  );
};
