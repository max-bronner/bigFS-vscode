import type { ModelScene } from '../../formats/w3d/w3dScene';
import { findModel, getLookKey, getModelError, loadModel, onStoreChanged } from './modelStore';
import type { ModelLook } from './modelStore';
import { $ } from './page';

const main = {
  wanted: undefined as ModelLook | undefined,
  shown: null as ModelScene | null | undefined,
  show: (() => {}) as (model: { name: string; scene: ModelScene } | undefined) => void,
};

const update = () => {
  const { wanted } = main;

  if (!wanted) {
    return;
  }

  const key = getLookKey(wanted);
  const scene = findModel(key);
  const file = `${wanted.name.replace(/\.w3d$/i, '')}.w3d`;

  if (scene === undefined) {
    loadModel(wanted);
  } else if (scene === null) {
    $('notice').textContent = getModelError(key) ?? `${file} was not found`;
  } else if (scene !== main.shown) {
    main.shown = scene;
    $('notice').textContent = '';
    main.show({ name: file, scene });
  }
};

export const onMainModel = (
  show: (model: { name: string; scene: ModelScene } | undefined) => void,
): void => {
  main.show = show;
};

export const showMainModel = (look: ModelLook | undefined): void => {
  main.wanted = look;
  if (look) {
    update();
  } else if (main.shown !== undefined) {
    main.shown = undefined;
    main.show(undefined);
  }
};

onStoreChanged(update);
