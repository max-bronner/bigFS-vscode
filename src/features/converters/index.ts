import { commands } from 'vscode';
import type { ExtensionContext } from 'vscode';
import { registerCommand } from '../../platform/commands';
import type { Services } from '../../services/createServices';
import { createConvertersView } from './createConvertersView';

export const registerConverters = (context: ExtensionContext, { archives }: Services): void => {
  context.subscriptions.push(
    createConvertersView(context, archives),
    registerCommand('bigfs.openConverters', () => commands.executeCommand('bigfs.converters.focus')),
  );
};
