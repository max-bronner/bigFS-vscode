import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerModDiffCommands } from './modDiffCommands';

export const registerMods = (
  context: ExtensionContext,
  { gameView }: Services,
): void => {
  registerModDiffCommands(context, gameView);
};
