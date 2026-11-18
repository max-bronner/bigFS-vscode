import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerLaunchCommands } from './launchCommands';
import { registerInstallDetectCommands } from './installDetectCommands';

export const registerInstalls = (
  context: ExtensionContext,
  { archives }: Services,
): void => {
  registerLaunchCommands(context);
  registerInstallDetectCommands(context, archives.whenReady());
};
