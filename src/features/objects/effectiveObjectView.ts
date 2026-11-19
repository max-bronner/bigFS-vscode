import * as vscode from 'vscode';
import { composeEffectiveObject, parseTemplateHeader } from '../../services/ini/effectiveObject';
import type { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import { registerCommand } from '../../platform/commands';

const SCHEME = 'bigfs-effective';

const createEffectiveContentProvider = (
  documents: SageIniDocuments,
  index: SageIniIndex,
) => {
  const changed = new vscode.EventEmitter<vscode.Uri>();

  return {
    onDidChange: changed.event,

    update: (uri: vscode.Uri): void => changed.fire(uri),

    refresh: (): void => {
      for (const document of vscode.workspace.textDocuments) {
        if (document.uri.scheme === SCHEME) {
          changed.fire(document.uri);
        }
      }
    },

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
      const query = new URLSearchParams(uri.query);

      return (
        (await composeEffectiveObject(
          documents,
          index,
          vscode.Uri.parse(query.get('uri') ?? ''),
          Number(query.get('line')),
        )) ?? `; ${uri.path.slice(1)} is no longer where it was`
      );
    },
  };
};

const toEffectiveUri = (uri: vscode.Uri, line: number, name: string) =>
  vscode.Uri.from({
    scheme: SCHEME,
    path: `/${name} (effective).ini`,
    query: new URLSearchParams({
      uri: uri.toString(),
      line: String(line),
    }).toString(),
  });

const createEffectiveLensProvider = (): vscode.CodeLensProvider => ({
  provideCodeLenses(document) {
    const lenses: vscode.CodeLens[] = [];

    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;

      if (!/^\s*(ChildObject|ObjectReskin)\s/i.test(text)) {
        continue;
      }

      const header = parseTemplateHeader(text);

      if (header.parent) {
        lenses.push(
          new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
            title: `Effective definition (inherits ${header.parent})`,
            command: 'bigfs.showEffectiveObject',
            arguments: [document.uri, line],
          }),
        );
      }
    }
    return lenses;
  },
});

export const registerEffectiveObjects = (
  selector: vscode.DocumentSelector,
  documents: SageIniDocuments,
  index: SageIniIndex,
): vscode.Disposable[] => {
  const provider = createEffectiveContentProvider(documents, index);
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.ini');

  return [
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, provider),
    vscode.languages.registerCodeLensProvider(
      selector,
      createEffectiveLensProvider(),
    ),
    watcher,
    watcher.onDidChange(() => provider.refresh()),
    watcher.onDidCreate(() => provider.refresh()),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (
        event.document.uri.scheme !== SCHEME &&
        event.document.languageId === 'sage-ini'
      ) {
        provider.refresh();
      }
    }),
    registerCommand(
      'bigfs.showEffectiveObject',
      async (uri?: vscode.Uri, line?: number) => {
        const editor = vscode.window.activeTextEditor;

        if (!uri || line === undefined) {
          if (!editor) {
            return undefined;
          }
          uri = editor.document.uri;

          for (line = editor.selection.active.line; line >= 0; line--) {
            if (
              /^\s*(Object|ChildObject|ObjectReskin)\s/i.test(
                editor.document.lineAt(line).text,
              )
            ) {
              break;
            }
          }
          if (line < 0) {
            void vscode.window.showInformationMessage(
              'Put the cursor inside an Object, ChildObject or ObjectReskin',
            );
            return undefined;
          }
        }

        const text = (await vscode.workspace.openTextDocument(uri)).lineAt(
          line,
        ).text;
        const target = toEffectiveUri(uri, line, parseTemplateHeader(text).name);

        provider.update(target);

        const view = await vscode.workspace.openTextDocument(target);

        await vscode.languages.setTextDocumentLanguage(view, 'sage-ini');
        await vscode.window.showTextDocument(view, {
          viewColumn: vscode.ViewColumn.Beside,
          preview: true,
        });
        return view;
      },
    ),
  ];
};
