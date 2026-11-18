import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { PreviewEditorProvider } from './previewEditorProvider';

export const registerPreview = (
  context: ExtensionContext,
  { tools, locator }: Services,
): void => {
  context.subscriptions.push(
    PreviewEditorProvider.register(tools, locator, context.extensionUri),
  );
};
