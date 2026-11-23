import type { LevelRung } from './creationUpgrades';
import type { ObjectScene } from './objectScene';
import { resolveShadowMacros } from './objectShadows';
import { readPadVariation } from './padVariation';
import type { PadLookup } from './padVariation';
import { readCreatedSubObjects } from './subObjectScripts';
import { resolveWheelMacros } from './truckWheels';
import { readUpgradeNeeds } from './upgradeNeeds';
import type { FindDefinitionLines } from './upgradeNeeds';

export interface SceneContext {
  levelTables: ReadonlyMap<string, LevelRung[]>;
  sun: [number, number, number];
  resolveMacro(name: string): string | undefined;
  scripts?: { events: string; lua: string };
}

export interface PreviewedContext {
  findDefinitionLines: FindDefinitionLines;
  padLookup: PadLookup;
}

export const completeObjectScene = async (
  scene: ObjectScene,
  context: SceneContext,
  previewed?: PreviewedContext,
): Promise<void> => {
  const levels = context.levelTables.get(scene.name.toLowerCase());

  scene.levels = levels;
  scene.sun = context.sun;
  resolveWheelMacros(scene, context.resolveMacro);
  for (const shadow of [scene.shadow, ...scene.states.map((state) => state.shadow)]) {
    if (shadow) {
      resolveShadowMacros(shadow, context.resolveMacro);
    }
  }
  scene.heldUpgrades = levels?.[0].upgrades ?? [];
  if (scene.luaEventLists.length && context.scripts) {
    scene.created = readCreatedSubObjects(
      scene.luaEventLists,
      context.scripts.events,
      context.scripts.lua,
    );
  }
  if (!previewed) {
    return;
  }
  if (scene.commandSets?.length) {
    scene.upgradeNeeds = await readUpgradeNeeds(
      scene.commandSets,
      previewed.findDefinitionLines,
    ).catch(() => ({}));
  }
  scene.padVariation = await readPadVariation(scene.name, previewed.padLookup).catch(
    () => undefined,
  );
};
