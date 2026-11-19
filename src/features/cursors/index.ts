import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerAnimationBuilder } from './animationBuilder';
import { registerCursorConversionCommands } from './cursorConversionCommands';

export const registerCursors = (
  context: ExtensionContext,
  _services: Services,
): void => {
  context.subscriptions.push(
    registerCursorConversionCommands(),
    registerAnimationBuilder(context),
  );
};
