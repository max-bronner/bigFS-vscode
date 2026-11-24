import { commands, window } from 'vscode';
import type { ExtensionContext, Uri } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerSageStrLanguage } from './sageStrLanguage';
import {
  CSF_VIEW_TYPE,
  CsfEditorProvider,
  STR_TABLE_VIEW_TYPE,
  StrTableEditorProvider,
} from './stringTableEditorProvider';
import { registerCommand } from '../../platform/commands';
import type { ConverterValues } from '../../core/converterDialog';
import { convertStringTables } from './convertStringTables';

export const registerStrings = (
  context: ExtensionContext,
  { gameLanguage, archives }: Services,
): void => {
  context.subscriptions.push(
    registerCommand('bigfs.chooseLanguage', () =>
      gameLanguage.choose(),
    ),
  );
  registerSageStrLanguage(context);
  context.subscriptions.push(
    window.registerCustomEditorProvider(
      STR_TABLE_VIEW_TYPE,
      new StrTableEditorProvider(context.extensionUri),
    ),
    window.registerCustomEditorProvider(
      CSF_VIEW_TYPE,
      new CsfEditorProvider(context.extensionUri),
      { supportsMultipleEditorsPerDocument: true },
    ),
    registerCommand('bigfs.convertStringTable', (target?: unknown, selection?: unknown, values?: ConverterValues) =>
      convertStringTables(context.extensionUri, archives, target, selection, values),
    ),
    registerCommand('bigfs.openStringTable', (uri?: Uri) => {
      const target = uri ?? window.activeTextEditor?.document.uri;

      return target
        ? commands.executeCommand('vscode.openWith', target, STR_TABLE_VIEW_TYPE)
        : undefined;
    }),
  );
};
