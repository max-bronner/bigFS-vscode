import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { createNodeCommandRegistrar } from '../../services/archives/nodeCommands';
import { registerModCommands } from './modCommands';
import { registerModDiffCommands } from './modDiffCommands';

export const registerMods = (
  context: ExtensionContext,
  { archives, gameView, explorerSelection }: Services,
): void => {
  context.subscriptions.push(
    ...registerModCommands(
      createNodeCommandRegistrar(context, explorerSelection),
      archives,
    ),
  );
  registerModDiffCommands(context, gameView);
};
