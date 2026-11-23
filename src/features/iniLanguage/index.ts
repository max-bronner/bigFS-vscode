import { languages } from 'vscode';
import type { ExtensionContext } from 'vscode';
import { SAGE_INI_LANGUAGE } from '../../constants';
import type { Services } from '../../services/createServices';
import { watchSageIniDialect } from '../../services/ini/sageIniDialect';
import { watchSageIniDiagnostics } from './sageIniDiagnostics';
import { registerSageIniValidation } from './sageIniValidation';
import { createCommandSetPreview } from '../../services/ini/commandSetPreview';
import { registerAssetLinks } from './assetLinks';
import { registerFileUses } from './fileUses';
import { registerMappedImageLens } from './mappedImageLens';
import { registerUnusedDefinitions } from './unusedDefinitions';
import { watchHotkeyClashes } from './hotkeyDiagnostics';
import {
  createCallHierarchyProvider,
  createTypeHierarchyProvider,
} from './sageIniHierarchy';
import { registerDuplicateDefinition } from './duplicateDefinition';
import { createAudioLookup } from '../../services/ini/audioLookup';
import { describeSound } from './soundHover';
import { createMappedImagePreview } from '../../services/mappedImagePreview';
import {
  SAGE_INI_CODE_ACTION_KINDS,
  createSageIniCodeActionProvider,
} from './providers/sageIniCodeActionProvider';
import { createSageIniFormattingProvider } from './providers/sageIniFormattingProvider';
import { createSageIniFoldingProvider } from './providers/sageIniFoldingProvider';
import { createSageIniOutlineProvider } from './providers/sageIniOutlineProvider';
import {
  SAGE_INI_LEGEND,
  createSageIniSemanticTokensProvider,
} from './providers/sageIniSemanticTokensProvider';
import { createSageIniHoverProvider } from './providers/sageIniHoverProvider';
import { createSageIniDefinitionProvider } from './providers/sageIniDefinitionProvider';
import { createSageIniReferenceProvider } from './providers/sageIniReferenceProvider';
import { createSageIniCompletionProvider } from './providers/sageIniCompletionProvider';
import { createSageIniRenameProvider } from './providers/sageIniRenameProvider';

export const registerIniLanguage = (
  context: ExtensionContext,
  {
    archives,
    iniDocuments: documents,
    iniIndex: index,
    gameLanguage,
    locator,
  }: Services,
): void => {
  const selector = { language: SAGE_INI_LANGUAGE };
  const mappedImagePreview = createMappedImagePreview(locator);
  const soundLookup = createAudioLookup(index, documents);

  context.subscriptions.push(
    ...registerAssetLinks(selector, documents, locator),
    ...registerFileUses(documents, index, archives),
    ...registerUnusedDefinitions(index),
    watchHotkeyClashes(documents, index, gameLanguage),
    registerMappedImageLens(selector),
    languages.registerCallHierarchyProvider(
      selector,
      createCallHierarchyProvider(documents, index),
    ),
    languages.registerTypeHierarchyProvider(
      selector,
      createTypeHierarchyProvider(documents, index),
    ),
    ...registerDuplicateDefinition(selector, documents, index),
    watchSageIniDialect(),
    watchSageIniDiagnostics(documents, index, gameLanguage, locator),
    ...registerSageIniValidation(documents, archives, locator),
    languages.registerFoldingRangeProvider(
      selector,
      createSageIniFoldingProvider(documents),
    ),
    languages.registerDocumentSymbolProvider(
      selector,
      createSageIniOutlineProvider(documents),
    ),
    languages.registerDocumentSemanticTokensProvider(
      selector,
      createSageIniSemanticTokensProvider(documents),
      SAGE_INI_LEGEND,
    ),
    languages.registerHoverProvider(
      selector,
      createSageIniHoverProvider(
        documents,
        index,
        mappedImagePreview,
        createCommandSetPreview(index, mappedImagePreview),
        (parsed, line, token, uri) =>
          describeSound((name) => soundLookup(name, uri), parsed, line, token, uri),
      ),
    ),
    languages.registerDefinitionProvider(
      selector,
      createSageIniDefinitionProvider(documents, index),
    ),
    languages.registerReferenceProvider(
      selector,
      createSageIniReferenceProvider(documents, index),
    ),
    languages.registerCompletionItemProvider(
      selector,
      createSageIniCompletionProvider(documents, index),
    ),
    languages.registerCodeActionsProvider(
      selector,
      createSageIniCodeActionProvider(documents, index),
      { providedCodeActionKinds: SAGE_INI_CODE_ACTION_KINDS },
    ),
    languages.registerDocumentFormattingEditProvider(
      selector,
      createSageIniFormattingProvider(documents),
    ),
    languages.registerRenameProvider(
      selector,
      createSageIniRenameProvider(documents, index),
    ),
  );
};
