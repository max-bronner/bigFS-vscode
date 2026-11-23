import type { TextureLayers } from '../../formats/w3d/w3dTextureSwaps';
import { findBodyDraw, readStateModel } from './drawStates';
import { listTextureLayers } from './objectAppearance';
import type { AppearanceChoice } from './objectAppearance';
import type { ObjectComposition } from './objectComposition';
import { readStateConditions } from './objectScene';
import type { ObjectScene, SceneState } from './objectScene';

export interface PreloadModel {
  name: string;
  textures: TextureLayers;
  hasDetailModels?: boolean;
}

export interface PreloadPlan {
  models: PreloadModel[];
  animations: string[];
}

export const MAX_PRELOAD_MODELS = 96;
const MAX_PRELOAD_ANIMATIONS = 160;

export const listPreloads = (
  scene: ObjectScene,
  compositions: readonly ObjectComposition[],
  choice: AppearanceChoice,
): PreloadPlan => {
  const models = new Map<string, PreloadModel>();
  const animations = new Map<string, string>();
  const addModel = (name: string, textures: TextureLayers, hasDetailModels?: boolean) => {
    const key = `${name}${JSON.stringify(textures)}`.toLowerCase();

    if (models.size < MAX_PRELOAD_MODELS && !models.has(key)) {
      models.set(key, { name, textures, ...(hasDetailModels ? { hasDetailModels } : {}) });
    }
  };
  const addAnimation = (name: string | undefined) => {
    if (name && animations.size < MAX_PRELOAD_ANIMATIONS) {
      animations.set(name.toLowerCase(), name);
    }
  };

  for (const { parts } of compositions) {
    for (const part of parts) {
      if (part.model) {
        addModel(part.model, part.textures ?? [], part.hasDetailModels);
      }
      addAnimation(part.animation);
    }
  }

  const body = findBodyDraw(scene);
  const building = scene.upgrades.flatMap((module) => module.raisesTemporarily ?? []);
  const rank = (state: SceneState) =>
    readStateConditions(state).some((each) => building.includes(each)) ? 1 : 0;
  const states = scene.states
    .filter((state) => state.draw === body)
    .sort((a, b) => rank(a) - rank(b));

  for (const state of states) {
    const model = state.kind === 'model' ? readStateModel(state) : undefined;

    if (model) {
      addModel(
        model,
        listTextureLayers(scene, state.draw, state, choice),
        scene.detailDraws?.includes(state.draw),
      );
    }
    addAnimation(state.animations[0]);
  }
  return { models: [...models.values()], animations: [...animations.values()] };
};
