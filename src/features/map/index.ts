import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { MapEditorProvider } from './mapEditorProvider';

export const registerMap = (
  context: ExtensionContext,
  { iniIndex }: Services,
): void => {
  context.subscriptions.push(MapEditorProvider.register(iniIndex, context.extensionUri, context.globalState));
};
