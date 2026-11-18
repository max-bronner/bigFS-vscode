import type { ExtensionContext } from 'vscode';
import { SAGE_INI_LANGUAGE } from '../../constants';
import type { Services } from '../../services/createServices';
import { registerSoundPlayer } from './soundPlayer';

export const registerAudio = (
  context: ExtensionContext,
  { iniDocuments, iniIndex, locator }: Services,
): void => {
  context.subscriptions.push(
    ...registerSoundPlayer(
      context.extensionUri,
      { language: SAGE_INI_LANGUAGE },
      iniDocuments,
      iniIndex,
      locator,
    ),
  );
};
