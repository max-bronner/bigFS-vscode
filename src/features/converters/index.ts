import { commands } from 'vscode';
import type { ExtensionContext } from 'vscode';
import type { ConverterValues } from '../../core/converterDialog';
import { registerCommand } from '../../platform/commands';
import type { Services } from '../../services/createServices';
import { convertImages } from './convertImages';
import { createConverterDropView } from './createConverterDropView';
import { createConvertersView } from './createConvertersView';

export const registerConverters = (context: ExtensionContext, { archives }: Services): void => {
  const dropView = createConverterDropView((uris) => convertersView.addDropped(uris));
  const convertersView = createConvertersView(context, () => dropView.show());

  context.subscriptions.push(
    convertersView,
    dropView,
    registerCommand('bigfs.openConverters', () => commands.executeCommand('bigfs.converters.focus')),
    registerCommand('bigfs.convertPng', (target?: unknown, selection?: unknown, values?: ConverterValues) =>
      convertImages(context.extensionUri, archives, target, selection, values),
    ),
  );
};
