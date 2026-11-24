import * as vscode from 'vscode';
import { formatCount } from '../core/messages';
import { partitionByExtension } from '../core/partitionByExtension';

export interface ConverterFiles {
  accepted: vscode.Uri[];
  skipped: string[];
}

const getFileName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf('/') + 1);

export const collectConverterFiles = async (
  given: readonly vscode.Uri[],
  {
    extensions,
    kind,
    canSelectFolders = false,
  }: {
    extensions: readonly string[];
    kind: string;
    canSelectFolders?: boolean;
  },
): Promise<ConverterFiles | undefined> => {
  const files = given.length
    ? given
    : ((await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders,
        filters: { [kind]: [...extensions] },
        openLabel: 'Choose',
      })) ?? []);

  if (!files.length) {
    return undefined;
  }

  const folders = canSelectFolders
    ? new Set(
        (
          await Promise.all(
            files.map(async (uri) =>
              (await Promise.resolve(vscode.workspace.fs.stat(uri)).then(
                ({ type }) => type & vscode.FileType.Directory,
                () => 0,
              ))
                ? uri.toString()
                : '',
            ),
          )
        ).filter(Boolean),
      )
    : new Set<string>();
  const sorted = partitionByExtension(
    files.filter((uri) => !folders.has(uri.toString())),
    getFileName,
    extensions,
  );
  const accepted = files.filter(
    (uri) => folders.has(uri.toString()) || sorted.accepted.includes(uri),
  );
  const { skipped } = sorted;

  if (!accepted.length) {
    void vscode.window.showWarningMessage(
      `None of the ${formatCount(files.length, 'file')} given is one of the ${kind} this converter takes.`,
    );
    return undefined;
  }
  return {
    accepted,
    skipped: skipped.map((uri) => `${getFileName(uri)} (not one of the ${kind})`),
  };
};
