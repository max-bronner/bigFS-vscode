import { ConfigurationTarget, window, workspace } from 'vscode';
import type { ExtensionContext, Uri } from 'vscode';
import { revealEntry } from './revealEntry';
import type { Services } from '../../services/createServices';
import type { ExplorerRow } from '../../services/archives/explorerRow';
import { SCHEME } from '../../constants';
import { registerCommand } from '../../platform/commands';
import { setContextKey } from '../../platform/contextKeys';
import { onDidChangeSetting, settings } from '../../platform/settings';
import { BigFileSystemProvider } from './fileSystemProvider';
import { BigTreeDataProvider, isGameViewShown } from './treeDataProvider';
import { BigDragAndDropController } from './dragAndDropController';
import { createNodeCommandRegistrar } from '../../services/archives/nodeCommands';
import { registerFileCommands } from './fileCommands';
import { registerExtractCommands } from './extractCommands';
import { registerClipboardCommands } from './clipboardCommands';
import { createArchive } from './archiveFileActions';
import { updateAtFirstTarget } from './updateAtFirstTarget';

export const registerExplorer = (
  context: ExtensionContext,
  { archives, gameView, explorerSelection, log }: Services,
): void => {
  const markScanned = async () => {
    await setContextKey('hasArchives', archives.getArchiveRoots().length > 0);
    await setContextKey('scanned', true);
  };

  archives
    .whenReady()
    .finally(markScanned)
    .catch((error: unknown) => log.error('Failed to mark the scan done', error));

  const fileSystemProvider = new BigFileSystemProvider(archives);
  const treeDataProvider = new BigTreeDataProvider(archives, gameView);

  const showView = (isGame: boolean) =>
    updateAtFirstTarget(
      (target) =>
        settings.explorerView.update(isGame ? 'game' : 'archives', target),
      [ConfigurationTarget.Workspace, ConfigurationTarget.Global],
    );

  void setContextKey('gameView', isGameViewShown());
  context.subscriptions.push(
    fileSystemProvider,
    registerCommand('bigfs.showGameView', () => showView(true)),
    registerCommand('bigfs.showArchiveView', () => showView(false)),
    onDidChangeSetting([settings.explorerView], () => {
      void setContextKey('gameView', isGameViewShown());
      treeDataProvider.refresh();
    }),
    workspace.registerFileSystemProvider(SCHEME, fileSystemProvider, {
      isCaseSensitive: false,
      isReadonly: false,
    }),
  );

  const treeView = window.createTreeView('bigArchiveExplorer', {
    treeDataProvider,
    dragAndDropController: new BigDragAndDropController(archives),
    showCollapseAll: true,
    canSelectMany: true,
  });

  context.subscriptions.push(treeView);
  explorerSelection.attach(treeView);

  const registerNodeCommand = createNodeCommandRegistrar(
    context,
    explorerSelection,
  );

  registerFileCommands(registerNodeCommand, archives);
  registerExtractCommands(registerNodeCommand, archives);
  registerClipboardCommands(registerNodeCommand, archives);
  context.subscriptions.push(
    registerCommand('bigfs.revealEntry', (uri: Uri) =>
      revealEntry(uri, treeView, archives, gameView),
    ),
    registerCommand('bigfs.newArchive', (row?: ExplorerRow) =>
      row ? createArchive(archives, row) : undefined,
    ),
    registerCommand('bigfs.refreshArchives', async () => {
      await setContextKey('scanned', false);

      try {
        await archives.scanWorkspace();
        gameView.invalidate();
      } finally {
        treeDataProvider.refresh();
        await markScanned();
      }
    }),
    workspace.onDidSaveTextDocument(async (document) => {
      if (document.uri.scheme === SCHEME) {
        window.setStatusBarMessage(
          `BIG archive updated: ${document.uri.path}`,
          4000,
        );
      }
    }),
  );
};
