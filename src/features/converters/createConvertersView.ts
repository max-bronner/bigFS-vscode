import * as vscode from 'vscode';
import { assignConverterFiles } from '../../core/assignConverterFiles';
import type { GivenConverterFile } from '../../core/assignConverterFiles';
import { CONVERTER_FILE_TYPES } from '../../core/converterFileTypes';
import { describeError } from '../../core/errors';
import type { ConverterKind } from '../../core/converterFileTypes';
import { formatCount } from '../../core/messages';
import { partitionByExtension } from '../../core/partitionByExtension';
import { getPageBundleFolder } from '../../platform/webview/pageBundle';
import type { FromConvertersPage, ListedFile, ToConvertersPage } from '../../webview/converters/protocol';
import { renderConvertersPage } from './renderConvertersPage';

const CONVERTER_COMMANDS: Record<ConverterKind, string> = {
  image: 'bigfs.convertPng',
  cursor: 'bigfs.convertPngToCursor',
  video: 'bigfs.convertToVp6',
  strings: 'bigfs.convertStringTable',
};

const CONVERTER_TITLES: Record<ConverterKind, string> = {
  image: 'Image to game texture',
  cursor: 'Cursor',
  video: 'Movie to VP6',
  strings: 'String table',
};

const FOLDER_DEPTH = 8;
const FOLDER_FILES = 5000;

const NOTE_MILLISECONDS = 10000;

export interface ConvertersView extends vscode.Disposable {
  addDropped(given: readonly vscode.Uri[]): Promise<void>;
}

const getFileName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf('/') + 1);

const parseUris = (texts: unknown): vscode.Uri[] =>
  (Array.isArray(texts) ? texts : []).flatMap((text: unknown) => {
    try {
      return typeof text === 'string' ? [vscode.Uri.parse(text, true)] : [];
    } catch {
      return [];
    }
  });

const isFolder = (uri: vscode.Uri): Promise<boolean> =>
  Promise.resolve(vscode.workspace.fs.stat(uri)).then(
    ({ type }) => (type & vscode.FileType.Directory) !== 0,
    () => false,
  );

const listFolder = async (folder: vscode.Uri, depth = 0, found: vscode.Uri[] = []): Promise<vscode.Uri[]> => {
  const entries = await Promise.resolve(vscode.workspace.fs.readDirectory(folder)).then(
    (read) => read,
    () => [] as [string, vscode.FileType][],
  );

  for (const [name, type] of entries.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    if (found.length >= FOLDER_FILES) {
      break;
    }
    if (type & vscode.FileType.Directory) {
      if (depth < FOLDER_DEPTH) {
        await listFolder(vscode.Uri.joinPath(folder, name), depth + 1, found);
      }
    } else {
      found.push(vscode.Uri.joinPath(folder, name));
    }
  }
  return found;
};

const collectFiles = async (converter: ConverterKind, given: readonly vscode.Uri[]): Promise<ToConvertersPage> => {
  const files: vscode.Uri[] = [];
  const skipped: string[] = [];

  for (const uri of given) {
    if (!(await isFolder(uri))) {
      files.push(uri);
      continue;
    }

    const below = partitionByExtension(await listFolder(uri), getFileName, CONVERTER_FILE_TYPES[converter].extensions);

    files.push(...below.accepted);
    if (below.skipped.length) {
      skipped.push(`${below.skipped.length} other files in ${getFileName(uri)}`);
    }
  }

  const sorted = partitionByExtension(files, getFileName, CONVERTER_FILE_TYPES[converter].extensions);

  return {
    kind: 'add',
    converter,
    files: sorted.accepted.map((uri): ListedFile => ({ uri: uri.toString(), name: getFileName(uri) })),
    skipped: [...sorted.skipped.map(getFileName), ...skipped],
  };
};

const expandFolders = async (given: readonly vscode.Uri[]): Promise<GivenConverterFile<vscode.Uri>[]> => {
  const files: GivenConverterFile<vscode.Uri>[] = [];

  for (const uri of given) {
    const folder = (await isFolder(uri)) ? getFileName(uri) : undefined;

    for (const file of folder === undefined ? [uri] : await listFolder(uri)) {
      files.push({ file, name: getFileName(file), key: file.toString(), folder });
    }
  }
  return files;
};

export const createConvertersView = (context: vscode.ExtensionContext, onDidShow: () => void): ConvertersView => {
  let view: vscode.WebviewView | undefined;
  let isReady = false;
  const listed: Record<ConverterKind, string[]> = { image: [], cursor: [], video: [], strings: [] };
  const pending: ToConvertersPage[] = [];
  const note = vscode.window.createStatusBarItem('bigfs.converterDropNote', vscode.StatusBarAlignment.Left);
  let noteTimer: ReturnType<typeof setTimeout> | undefined;

  note.name = 'Converter Drop';

  const post = (message: ToConvertersPage) => {
    if (view && isReady) {
      void view.webview.postMessage(message);
      return;
    }
    pending.push(message);
    if (!view) {
      void vscode.commands.executeCommand('bigfs.converters.focus');
    }
  };

  const add = async (converter: ConverterKind, given: readonly vscode.Uri[]) => {
    if (given.length) {
      post(await collectFiles(converter, given));
    }
  };

  const addDropped = async (given: readonly vscode.Uri[]) => {
    if (!given.length) {
      return;
    }

    const files = await expandFolders(given);
    const { added, skipped, duplicates } = assignConverterFiles(files, listed);
    const count = [...added.values()].reduce((sum, uris) => sum + uris.length, 0);

    for (const [converter, uris] of added) {
      post({
        kind: 'add',
        converter,
        files: uris.map((uri) => ({ uri: uri.toString(), name: getFileName(uri) })),
        skipped: [],
      });
    }

    const left = files.length - count;

    note.text = `Added ${formatCount(count, 'file')}${left ? ` · skipped ${left} (hover for details)` : ''}`;
    note.tooltip = [
      ...[...added].map(([converter, uris]) => `${CONVERTER_TITLES[converter]}: ${uris.map(getFileName).join(', ')}`),
      ...(duplicates ? [`Already listed: ${formatCount(duplicates, 'file')}`] : []),
      ...(skipped.length ? [`Skipped, taken by no single converter: ${skipped.join(', ')}`] : []),
    ].join('\n');
    note.show();
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => note.hide(), NOTE_MILLISECONDS);
  };

  const onMessage = async (message: FromConvertersPage) => {
    if (message.kind === 'ready') {
      isReady = true;
      pending.splice(0).forEach((held) => void view?.webview.postMessage(held));
      return;
    }
    if (!(message.converter in CONVERTER_COMMANDS)) {
      return;
    }
    if (message.kind === 'listed') {
      listed[message.converter] = (Array.isArray(message.uris) ? message.uris : []).filter(
        (uri): uri is string => typeof uri === 'string',
      );
    } else if (message.kind === 'pick') {
      const { extensions, kind } = CONVERTER_FILE_TYPES[message.converter];
      const picked = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        filters: { [kind]: [...extensions], 'All files': ['*'] },
        openLabel: 'Add',
      });

      await add(message.converter, picked ?? []);
    } else if (message.kind === 'convert') {
      const uris = parseUris(message.uris);

      if (uris.length) {
        await vscode.commands.executeCommand(CONVERTER_COMMANDS[message.converter], uris[0], uris);
      }
    }
  };

  const registration = vscode.window.registerWebviewViewProvider(
    'bigfs.converters',
    {
      resolveWebviewView: (resolved) => {
        view = resolved;
        isReady = false;
        resolved.webview.options = {
          enableScripts: true,
          localResourceRoots: [getPageBundleFolder(context.extensionUri)],
        };
        resolved.webview.html = renderConvertersPage(resolved.webview, context.extensionUri);
        onDidShow();
        resolved.webview.onDidReceiveMessage((message: FromConvertersPage) =>
          onMessage(message).catch((error: unknown) => void vscode.window.showErrorMessage(describeError(error))),
        );
        resolved.onDidDispose(() => {
          view = undefined;
          isReady = false;
          for (const converter of Object.keys(listed) as ConverterKind[]) {
            listed[converter] = [];
          }
        });
      },
    },
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  return {
    addDropped,
    dispose: () => {
      clearTimeout(noteTimer);
      note.dispose();
      registration.dispose();
    },
  };
};
