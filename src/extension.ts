import type { ExtensionContext } from 'vscode';
import { createServices } from './services/createServices';
import type { Services } from './services/createServices';
import { registerPreview } from './features/preview';
import { registerParticles } from './features/particles';
import { registerBulkEdit } from './features/bulkEdit';
import { registerObjects } from './features/objects';
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
import { registerWnd } from './features/wnd';
import { registerTextures } from './features/textures';
import { registerW3d } from './features/w3d';
import { registerVideo } from './features/video';
import { registerInstalls } from './features/installs';
import { registerMods } from './features/mods';
import { registerExplorer } from './features/explorer';

const FEATURES: ((context: ExtensionContext, services: Services) => void)[] = [
  registerPreview,
  registerParticles,
  registerBulkEdit,
  registerObjects,
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
  registerWnd,
  registerTextures,
  registerW3d,
  registerVideo,
  registerInstalls,
  registerMods,
  registerExplorer,
];

export function activate(context: ExtensionContext): void {
  const services = createServices(context);

  for (const register of FEATURES) {
    register(context, services);
  }
}

export function deactivate() {}
