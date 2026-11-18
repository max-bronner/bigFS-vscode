import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerTextureCommands } from './textureCommands';

export const registerTextures = (
  context: ExtensionContext,
  _services: Services,
): void => {
  registerTextureCommands(context);
};
