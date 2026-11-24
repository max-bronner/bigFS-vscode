import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { createPreviewSettingsStore } from '../../platform/webview/createPreviewSettingsStore';
import { AptEditorProvider } from './aptEditorProvider';
import { registerAptTextLanguage } from './aptTextLanguage';
import { registerAptCommands } from './aptCommands';
import { registerRuRegionLens } from './ruRegionLens';

export const registerApt = (
  context: ExtensionContext,
  { tools, locator, archives, gameLanguage, iniIndex, iniDocuments }: Services,
): void => {
  const editor = AptEditorProvider.register(
    tools,
    locator,
    archives,
    context.extensionUri,
    {
      gameLanguage,
      index: iniIndex,
      documents: iniDocuments,
      state: context.workspaceState,
      settings: createPreviewSettingsStore(context.globalState, 'apt'),
    },
  );

  context.subscriptions.push(
    editor,
    registerAptTextLanguage(),
    registerRuRegionLens(),
  );
  registerAptCommands(context, editor, archives);
};
