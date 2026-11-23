import { getTextureStem } from '../../formats/w3d/w3dTextureSwaps';
import type { TextureLayers, TextureSwap } from '../../formats/w3d/w3dTextureSwaps';
import { readStateConditions } from './objectScene';
import type { ObjectScene, SceneState, SceneUpgrade } from './objectScene';
import { walkUpgrades } from './walkUpgrades';

export interface AppearanceChoice {
  isSnowy?: boolean;
  upgrades?: string[];
  conditions?: string[];
  randomTexture?: number;
  level?: number;
}

export interface AppearanceOptions {
  canSnow: boolean;
  upgrades: string[];
  randomTextureCount: number;
  needs?: Record<string, string[]>;
  excludes?: Record<string, string[]>;
}

export interface TextureVariant {
  model: string;
  label: string;
  layers: TextureLayers;
}

export const SNOW_CONDITION = 'SNOW';
const MAX_TEXTURE_VARIANTS = 96;

const MODEL_STATE = /^(default)?(model)?conditionstate\b/i;

const isModelState = (state: SceneState) =>
  state.kind === 'model' && MODEL_STATE.test(state.label);

const getModelConditions = (state: SceneState) =>
  readStateConditions(state).filter((condition) => condition !== 'NONE');

export const pickModelState = (
  states: readonly SceneState[],
  held: ReadonlySet<string>,
): SceneState | undefined => {
  let fallback: SceneState | undefined;

  for (const state of states.filter(isModelState)) {
    const conditions = getModelConditions(state);

    if (!conditions.length) {
      fallback ??= state;
    } else if (conditions.every((each) => held.has(each))) {
      return state;
    }
  }
  return fallback;
};

const getWeaponSetCondition = (flag: string): string | undefined => {
  const name = flag.toUpperCase();

  if (name === 'WEAPONSET_ONE_RING_MODE') {
    return 'ONE_RING';
  }
  if (name === 'HIDDEN') {
    return name;
  }
  if (name.startsWith('ARMORSET_')) {
    return undefined;
  }
  if (name.startsWith('WEAPON_RIDER')) {
    return name.replace('WEAPON_RIDER', 'WEAPONSET_RIDER');
  }
  return name.startsWith('WEAPONSET_') ? name : `WEAPONSET_${name}`;
};

export const getRaisedConditions = ({ addsConditions = [], weaponSetFlag }: SceneUpgrade): string[] => {
  const weaponSet = weaponSetFlag && getWeaponSetCondition(weaponSetFlag);

  return [...addsConditions.map((each) => each.toUpperCase()), ...(weaponSet ? [weaponSet] : [])];
};

export const listHeldConditions = (
  scene: ObjectScene,
  choice: AppearanceChoice = {},
): string[] => {
  const held = new Set<string>();
  const { created, added } = walkUpgrades(scene, choice.upgrades);

  for (const upgrade of [...created, ...added]) {
    for (const removed of upgrade.removesConditions ?? []) {
      held.delete(removed.toUpperCase());
    }
    for (const raised of getRaisedConditions(upgrade)) {
      held.add(raised);
    }
  }
  if (choice.isSnowy) {
    held.add(SNOW_CONDITION);
  }
  for (const condition of choice.conditions ?? []) {
    held.add(condition.toUpperCase());
  }
  return [...held];
};

const groupRandomTextures = (scene: ObjectScene, draw?: string) => {
  const groups = new Map<string, TextureSwap[]>();

  for (const each of scene.randomTextures ?? []) {
    if (draw === undefined || each.draw === draw) {
      const key = `${each.draw}|${each.index}|${getTextureStem(each.from)}`;

      groups.set(key, [...(groups.get(key) ?? []), { from: each.from, to: each.to }]);
    }
  }
  return [...groups.values()];
};

const listUpgradeSwaps = ({ textures = [], excludes }: SceneUpgrade): TextureSwap[] =>
  [...textures].reverse().map((swap) => (excludes?.length ? { ...swap, exclude: excludes } : swap));

export const listTextureLayers = (
  scene: ObjectScene,
  draw: string,
  state: SceneState | undefined,
  choice: AppearanceChoice = {},
): TextureLayers => {
  const picked = choice.randomTexture;
  const random =
    picked === undefined || !Number.isInteger(picked) || picked < 0
      ? []
      : groupRandomTextures(scene, draw).map((group) => group[picked % group.length]);
  const { created, added } = walkUpgrades(scene, choice.upgrades);
  const inForce = [...created, ...added].reverse().find((upgrade) => upgrade.textures?.length);

  return [random, [...(state?.textures ?? []), ...(inForce ? listUpgradeSwaps(inForce) : [])]].filter(
    (layer) => layer.length,
  );
};

const listRelations = (
  scenes: readonly ObjectScene[],
  names: readonly string[],
): Pick<AppearanceOptions, 'needs' | 'excludes'> => {
  const modules = scenes.flatMap((scene) => scene.upgrades);
  const needs = new Map<string, string[]>();
  const refuses = new Map<string, Set<string>>();

  for (const name of names) {
    const key = name.toLowerCase();
    const own = modules.filter((each) => each.triggers.some((t) => t.toLowerCase() === key));
    const needsOthers = own.every((each) => each.requiresAllTriggers && each.triggers.length > 1);

    if (own.length && needsOthers) {
      const shared = own[0].triggers.filter(
        (trigger) =>
          trigger.toLowerCase() !== key &&
          own.every((each) => each.triggers.some((t) => t.toLowerCase() === trigger.toLowerCase())),
      );

      if (shared.length) {
        needs.set(key, shared);
      }
    }
    refuses.set(key, new Set(own.flatMap((each) => each.conflicts ?? []).map((t) => t.toLowerCase())));
  }

  const excludes = new Map<string, string[]>();

  for (const [key, refused] of refuses) {
    const both = names.filter(
      (other) =>
        other.toLowerCase() !== key &&
        refused.has(other.toLowerCase()) &&
        refuses.get(other.toLowerCase())?.has(key),
    );

    if (both.length) {
      excludes.set(key, both);
    }
  }
  return {
    ...(needs.size ? { needs: Object.fromEntries(needs) } : {}),
    ...(excludes.size ? { excludes: Object.fromEntries(excludes) } : {}),
  };
};

export const listAppearanceOptions = (
  scenes: readonly ObjectScene[],
  namesSubObject?: (scene: ObjectScene, pattern: string) => boolean | undefined,
): AppearanceOptions => {
  const upgrades = new Map<string, string>();
  let canSnow = false;
  let randomTextureCount = 0;

  for (const scene of scenes) {
    const used = new Set(scene.states.filter(isModelState).flatMap(getModelConditions));
    const scripted = new Set(
      [...scene.states, ...(scene.cliplessStates ?? [])]
        .filter((state) => state.kind === 'animation' && state.subObjects.rules.length)
        .flatMap(readStateConditions),
    );
    const isNamed = (pattern: string) => namesSubObject?.(scene, pattern) ?? true;

    canSnow ||= used.has(SNOW_CONDITION) || !!scene.floors?.some((floor) => floor.snowTexture);
    for (const upgrade of scene.upgrades) {
      const changesLook =
        upgrade.shows.some(isNamed) ||
        upgrade.hides.some(isNamed) ||
        upgrade.textures?.length ||
        upgrade.spawns ||
        [...getRaisedConditions(upgrade), ...(upgrade.removesConditions ?? [])].some(
          (condition) => used.has(condition.toUpperCase()) || scripted.has(condition.toUpperCase()),
        );

      for (const name of changesLook ? upgrade.triggers : []) {
        if (!upgrades.has(name.toLowerCase())) {
          upgrades.set(name.toLowerCase(), name);
        }
      }
    }
    for (const group of groupRandomTextures(scene)) {
      randomTextureCount = Math.max(randomTextureCount, group.length);
    }
  }
  const names = [...upgrades.values()].sort();

  return { canSnow, upgrades: names, randomTextureCount, ...listRelations(scenes, names) };
};

export const listTextureVariants = (
  scenes: readonly ObjectScene[],
  getFileName: (model: string) => string,
): TextureVariant[] => {
  const variants = new Map<string, TextureVariant>();
  const add = (model: string, label: string, layer: TextureSwap[]) => {
    const file = getFileName(model);
    const key = `${file}|${JSON.stringify(layer).toLowerCase()}`;

    if (layer.length && !variants.has(key) && variants.size < MAX_TEXTURE_VARIANTS) {
      variants.set(key, { model: file, label, layers: [layer] });
    }
  };

  for (const scene of scenes) {
    const states = scene.states.filter(
      (state) => isModelState(state) && state.model && !/^none$/i.test(state.model),
    );

    for (const floor of scene.floors ?? []) {
      if (floor.model && floor.snowTexture) {
        add(floor.model, `Snow (${scene.name})`, [{ to: floor.snowTexture }]);
      }
    }
    for (const state of states) {
      const conditions = getModelConditions(state).join(' ');
      const label = conditions === SNOW_CONDITION ? 'Snow' : conditions || 'Default state';

      add(state.model!, `${label} (${scene.name})`, state.textures ?? []);
    }
    for (const upgrade of scene.upgrades) {
      const swaps = listUpgradeSwaps(upgrade);

      for (const state of swaps.length ? states : []) {
        add(state.model!, `${upgrade.triggers.join(' or ')} (${scene.name})`, swaps);
      }
    }
    for (const state of scene.randomTextures?.length ? states : []) {
      for (const group of groupRandomTextures(scene, state.draw)) {
        for (const swap of group) {
          if (getTextureStem(swap.to) !== getTextureStem(swap.from!)) {
            add(state.model!, `Random: ${getTextureStem(swap.to)} (${scene.name})`, [swap]);
          }
        }
      }
    }
  }
  return [...variants.values()];
};
