import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { ScriptFileEditorProvider } from './scriptFileEditorProvider';

export const registerScripts = (
  context: ExtensionContext,
  _services: Services,
): void => {
  context.subscriptions.push(ScriptFileEditorProvider.register(context.extensionUri));
};
