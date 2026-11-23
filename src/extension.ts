import type { ExtensionContext } from 'vscode';
import { createServices } from './services/createServices';
import type { Services } from './services/createServices';
import { registerPreview } from './features/preview';
import { registerBulkEdit } from './features/bulkEdit';
import { registerObjects } from './features/objects';
import { registerParticles } from './features/particles';
import { registerAudio } from './features/audio';
import { registerBalanceSheet } from './features/balanceSheet';
import { registerArmorTable } from './features/armorTable';
import { registerCommandSet } from './features/commandSet';
import { registerIniLanguage } from './features/iniLanguage';
import { registerMap } from './features/map';
import { registerScripts } from './features/scripts';
import { registerCah } from './features/cah';
import { registerApt } from './features/apt';
import { registerStrings } from './features/strings';
import { registerTranslations } from './features/translations';
import { registerWnd } from './features/wnd';
import { registerCursors } from './features/cursors';
import { registerTextures } from './features/textures';
import { registerW3d } from './features/w3d';
import { registerVideo } from './features/video';
import { registerInstalls } from './features/installs';
import { registerMods } from './features/mods';
import { registerArchiveSearch } from './features/archiveSearch';
import { registerConverters } from './features/converters';
import { registerFileFinder } from './features/fileFinder';
import { registerExplorer } from './features/explorer';
import { registerAssetCatalogue } from './features/assetCatalogue';

const FEATURES: ((context: ExtensionContext, services: Services) => void)[] = [
  registerPreview,
  registerBulkEdit,
  registerObjects,
  registerParticles,
  registerAudio,
  registerBalanceSheet,
  registerArmorTable,
  registerCommandSet,
  registerIniLanguage,
  registerMap,
  registerScripts,
  registerCah,
  registerApt,
  registerStrings,
  registerTranslations,
  registerWnd,
  registerTextures,
  registerCursors,
  registerW3d,
  registerVideo,
  registerInstalls,
  registerMods,
  registerAssetCatalogue,
  registerArchiveSearch,
  registerConverters,
  registerFileFinder,
  registerExplorer,
];

export function activate(context: ExtensionContext): void {
  const services = createServices(context);

  for (const register of FEATURES) {
    register(context, services);
  }
}

export function deactivate() {}
