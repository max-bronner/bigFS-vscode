import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { createNodeCommandRegistrar } from '../../services/archives/nodeCommands';
import { registerCompareVersions } from './compareVersionsCommand';
import { registerModCommands } from './modCommands';
import { registerModDiffCommands } from './modDiffCommands';

export const registerMods = (
  context: ExtensionContext,
  { archives, gameView, explorerSelection, iniDocuments }: Services,
): void => {
  context.subscriptions.push(
    ...registerModCommands(
      createNodeCommandRegistrar(context, explorerSelection),
      archives,
    ),
  );
  context.subscriptions.push(...registerCompareVersions(archives, gameView));
  registerModDiffCommands(context, gameView, iniDocuments);
};
