import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerArmorTable as registerArmorTableCommand } from './armorTable';

export const registerArmorTable = (
  context: ExtensionContext,
  { iniDocuments, iniIndex }: Services,
): void => {
  context.subscriptions.push(
    registerArmorTableCommand(context, iniDocuments, iniIndex),
  );
};
