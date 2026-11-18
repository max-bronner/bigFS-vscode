import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerSageWndLanguage } from './sageWndLanguage';

export const registerWnd = (
  context: ExtensionContext,
  { iniIndex, locator, gameLanguage }: Services,
): void => {
  registerSageWndLanguage(context, { index: iniIndex, locator, gameLanguage });
};
