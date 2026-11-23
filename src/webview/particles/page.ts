import { ParticleWorld } from '../../formats/particles/particleSimulation';
import type { FxListDef } from '../../formats/particles/particleIni';
import type { ParticleDef } from '../../formats/particles/particleDef';
import type { FromPage, SceneMessage } from './protocol';
import { getVsCodeApi } from '../shared/vscodeApi';
import { createViewer } from '../shared/viewer/createViewer';

const api = getVsCodeApi<FromPage>();

export const post = (message: FromPage): void => api.postMessage(message);

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

let pickClip: (name: string) => void = () => {};

export const onClipPicked = (pick: (name: string) => void): void => {
  pickClip = pick;
};

export const viewer = createViewer($('viewer'), {
  onPickClip: (name) => pickClip(name),
  settings: {
    initial: $('viewer').dataset.settingsOpen === 'true',
    onChange: (isOpen) => post({ kind: 'setViewerSettingsOpen', isOpen }),
  },
});

export const isObjectPage = $('context').classList.contains('preview-object');

viewer.stage.append($('handles'), $('flash'), $('hud'));
viewer.side.prepend($('context'));
if (isObjectPage) {
  const { modelSection } = viewer;

  modelSection.open = false;
  modelSection.querySelector('summary')!.textContent = 'Model and particle load';
  modelSection.append($('stats'), $('notes'));
  $('loadSection').remove();
  viewer.side.append(modelSection);
} else {
  viewer.side.append($('loadSection'));
}

export const state = {
  scene: undefined as SceneMessage | undefined,
  roots: [] as number[],
};

export const library = {
  systems: new Map<string, ParticleDef>(),
  fxLists: new Map<string, FxListDef>(),
};

export const world = new ParticleWorld(
  {
    findSystem: (name) => library.systems.get(name.toLowerCase()),
    findFxList: (name) => library.fxLists.get(name.toLowerCase()),
  },
  7,
);
