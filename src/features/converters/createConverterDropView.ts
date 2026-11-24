import * as vscode from 'vscode';

const DROP_ROW = 'drop';

const readDroppedUris = async (dataTransfer: vscode.DataTransfer): Promise<vscode.Uri[]> => {
  const uris = new Map<string, vscode.Uri>();
  const addUri = (uri: vscode.Uri) => {
    const normalized = uri.scheme === 'file' ? vscode.Uri.file(uri.fsPath) : uri;

    uris.set(normalized.toString(), normalized);
  };
  const list = await dataTransfer.get('text/uri-list')?.asString();

  for (const line of (list ?? '').split(/\r?\n/)) {
    const text = line.trim();

    if (text && !text.startsWith('#')) {
      try {
        addUri(vscode.Uri.parse(text, true));
      } catch {
      }
    }
  }
  if (!uris.size) {
    dataTransfer.forEach((item) => {
      const uri = item.asFile()?.uri;

      if (uri) {
        addUri(uri);
      }
    });
  }
  return [...uris.values()];
};

export interface ConverterDropView extends vscode.Disposable {
  show(): void;
}

export const createConverterDropView = (onDrop: (uris: vscode.Uri[]) => Promise<void>): ConverterDropView => {
  const treeView = vscode.window.createTreeView<string>('bigfs.converterDrop', {
    treeDataProvider: {
      getChildren: (row) => (row ? [] : [DROP_ROW]),
      getParent: () => undefined,
      getTreeItem: () => {
        const item = new vscode.TreeItem('Drop files here');

        item.iconPath = new vscode.ThemeIcon('cloud-download');
        item.tooltip = 'Each file goes to the card of the one converter that takes it; a folder adds the files inside it';
        return item;
      },
    },
    dragAndDropController: {
      dragMimeTypes: [],
      dropMimeTypes: ['text/uri-list', 'files'],
      handleDrop: async (_target, dataTransfer) => onDrop(await readDroppedUris(dataTransfer)),
    },
  });

  return {
    show: () => void treeView.reveal(DROP_ROW, { select: false, focus: false }),
    dispose: () => treeView.dispose(),
  };
};
