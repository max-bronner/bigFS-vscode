import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerBalanceSheet as registerBalanceSheetCommand } from './balanceSheet';

export const registerBalanceSheet = (
  context: ExtensionContext,
  { iniDocuments, iniIndex }: Services,
): void => {
  context.subscriptions.push(
    registerBalanceSheetCommand(context.extensionUri, iniDocuments, iniIndex),
  );
};
