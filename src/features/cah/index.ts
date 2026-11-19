import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { CahEditorProvider } from './cahEditorProvider';

export const registerCah = (
  context: ExtensionContext,
  { iniIndex, iniDocuments, gameLanguage, locator }: Services,
): void => {
  context.subscriptions.push(
    CahEditorProvider.register({
      documents: iniDocuments,
      index: iniIndex,
      gameLanguage,
      locator,
      extensionUri: context.extensionUri,
    }),
  );
};
