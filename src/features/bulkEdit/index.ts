import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { registerBulkEdit as registerBulkEditCommand } from './bulkEditCommand';

export const registerBulkEdit = (
  context: ExtensionContext,
  { iniDocuments, archives }: Services,
): void => {
  context.subscriptions.push(
    registerBulkEditCommand(context, iniDocuments, archives),
  );
};
