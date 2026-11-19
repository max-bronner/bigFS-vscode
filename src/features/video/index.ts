import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerVideoCommands } from './videoCommands';

export const registerVideo = (
  context: ExtensionContext,
  services: Services,
): void => {
  registerVideoCommands(context, services.archives);
};
