import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import { CahEditorProvider } from './cahEditorProvider';

export const registerCah = (
  context: ExtensionContext,
  { iniIndex, gameLanguage, locator }: Services,
): void => {
  const documents = new SageIniDocuments(context.extensionUri);

  context.subscriptions.push(
    documents,
    CahEditorProvider.register({
      documents,
      index: iniIndex,
      gameLanguage,
      locator,
      extensionUri: context.extensionUri,
    }),
  );
};
