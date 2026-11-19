import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerW3dAnimationCommands } from './w3dAnimationCommands';

export const registerW3d = (
  context: ExtensionContext,
  services: Services,
): void => {
  context.subscriptions.push(registerW3dAnimationCommands(services.archives));
};
