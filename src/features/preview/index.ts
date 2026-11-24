import type { ExtensionContext } from 'vscode';
import type { Services } from '../../services/createServices';
import { createMappedImageRegionKind } from './mappedImageRegionKind';
import { createRuRegionKind } from './ruRegionKind';
import { createRegionDiscovery } from './createRegionDiscovery';
import { createRelatedModelSearch } from './createRelatedModelSearch';
import { createTextureRegions } from './createTextureRegions';
import { PreviewEditorProvider } from './previewEditorProvider';
import { registerEditMappedImageRegion } from './registerEditMappedImageRegion';
import { registerShowRuRegion } from './registerShowRuRegion';

export const registerPreview = (
  context: ExtensionContext,
  { tools, locator, archives, iniIndex, iniDocuments }: Services,
): void => {
  const regions = createTextureRegions(
    [createMappedImageRegionKind(archives), createRuRegionKind(archives)],
    createRegionDiscovery(iniIndex, locator),
  );

  context.subscriptions.push(
    regions,
    PreviewEditorProvider.register(
      tools,
      locator,
      context.extensionUri,
      regions,
      createRelatedModelSearch(locator, iniIndex, iniDocuments),
      context.globalState,
    ),
    registerEditMappedImageRegion(archives, locator, regions),
    registerShowRuRegion(locator, regions),
  );
};
