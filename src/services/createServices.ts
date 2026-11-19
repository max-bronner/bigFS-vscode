import { window } from 'vscode';
import type { ExtensionContext, LogOutputChannel } from 'vscode';
import { setCommandLog } from '../platform/commands';
import { ArchiveModel } from './archives/archiveModel';
import { GameViewModel } from './archives/gameViewModel';
import { EntryLocator } from './entryLocator';
import { createExplorerSelection } from './archives/explorerSelection';
import type { ExplorerSelection } from './archives/explorerSelection';
import { createToolRegistry } from '../core/toolRegistry';
import type { ToolBox } from '../core/toolRegistry';
import { decodeDdsTool, decodeTgaTool } from '../formats/texture/textureTools';
import { playableAudioTool } from '../formats/audio/audioTools';
import { parseW3dTool } from '../formats/w3d/w3dTools';
import { SageIniDocuments } from './ini/sageIniDocuments';
import { SageIniIndex } from './ini/sageIniIndex';
import { GameLanguage } from './ini/gameLanguage';

export interface Services {
  log: LogOutputChannel;
  archives: ArchiveModel;
  gameView: GameViewModel;
  explorerSelection: ExplorerSelection;
  locator: EntryLocator;
  tools: ToolBox;
  iniDocuments: SageIniDocuments;
  iniIndex: SageIniIndex;
  gameLanguage: GameLanguage;
}

export const createServices = (context: ExtensionContext): Services => {
  const log = window.createOutputChannel('bigFS', { log: true });
  setCommandLog(log);
  const archives = new ArchiveModel(log);
  const tools = createToolRegistry();

  tools.register(decodeTgaTool, decodeDdsTool, playableAudioTool, parseW3dTool);

  const gameView = new GameViewModel(archives);
  const locator = new EntryLocator(archives, gameView);
  const iniDocuments = new SageIniDocuments(context.extensionUri);
  const iniIndex = new SageIniIndex(
    archives,
    () => iniDocuments.getSchema(),
    log,
  );
  const gameLanguage = new GameLanguage(
    archives,
    context.workspaceState,
    iniIndex,
  );

  context.subscriptions.push(
    log,
    archives,
    locator,
    iniDocuments,
    iniIndex,
    iniDocuments.onDidChangeSchema(() => iniIndex.reset()),
    gameLanguage,
    gameView,
  );

  archives
    .whenReady()
    .then(() => iniIndex.whenReady())
    .catch((error: unknown) => log.error('Failed to index INI entries', error));

  void archives
    .whenReady()
    .then(() => gameLanguage.ensure())
    .catch((error: unknown) => log.error('Failed to settle language', error));

  return {
    log,
    archives,
    gameView,
    explorerSelection: createExplorerSelection(),
    locator,
    tools,
    iniDocuments,
    iniIndex,
    gameLanguage,
  };
};
