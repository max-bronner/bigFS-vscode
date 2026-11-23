import type { ObjectScene, SceneUpgrade } from './objectScene';

const FACTION =
  /^upgrade_(angmar|arnor|dwarf|elf|goblin|gondor|isengard|men|mordor|rohan|wild)faction$/i;

const MAX_CACHED_WALKS = 512;

export interface UpgradeWalk {
  created: readonly SceneUpgrade[];
  firedByScripts: readonly SceneUpgrade[];
  firedOnCompletion: readonly SceneUpgrade[];
  added: readonly SceneUpgrade[];
  active: ReadonlySet<string>;
}

interface ModuleKeys {
  triggers: string[];
  conflicts: string[];
}

interface WalkCache {
  upgrades: readonly SceneUpgrade[];
  heldUpgrades: readonly string[];
  created: ObjectScene['created'];
  creationGrants: ObjectScene['creationGrants'];
  upgradeNeeds: ObjectScene['upgradeNeeds'];
  keys: Map<SceneUpgrade, ModuleKeys>;
  prerequisites: Map<SceneUpgrade, string[]>;
  walks: Map<string, UpgradeWalk>;
}

const caches = new WeakMap<ObjectScene, WalkCache>();

const getCache = (scene: ObjectScene): WalkCache => {
  const cache = caches.get(scene);

  if (
    cache &&
    cache.upgrades === scene.upgrades &&
    cache.heldUpgrades === scene.heldUpgrades &&
    cache.created === scene.created &&
    cache.creationGrants === scene.creationGrants &&
    cache.upgradeNeeds === scene.upgradeNeeds
  ) {
    return cache;
  }

  const fresh: WalkCache = {
    upgrades: scene.upgrades,
    heldUpgrades: scene.heldUpgrades,
    created: scene.created,
    creationGrants: scene.creationGrants,
    upgradeNeeds: scene.upgradeNeeds,
    keys: new Map(),
    prerequisites: new Map(),
    walks: new Map(),
  };

  caches.set(scene, fresh);
  return fresh;
};

const getKeys = (cache: WalkCache, module: SceneUpgrade): ModuleKeys => {
  let keys = cache.keys.get(module);

  if (!keys) {
    keys = {
      triggers: module.triggers.map((name) => name.toLowerCase()),
      conflicts: (module.conflicts ?? []).map((name) => name.toLowerCase()),
    };
    cache.keys.set(module, keys);
  }
  return keys;
};

export const isFactionUpgrade = (name: string): boolean => FACTION.test(name);

const changesLook = (module: SceneUpgrade) =>
  !!(
    module.shows.length ||
    module.hides.length ||
    module.spawns ||
    module.textures?.length ||
    module.addsConditions?.length ||
    module.weaponSetFlag
  );

const findPrerequisites = (
  scene: ObjectScene,
  cache: WalkCache,
  module: SceneUpgrade,
): string[] => {
  const { triggers, requiresAllTriggers } = module;

  if (!requiresAllTriggers || triggers.length < 2) {
    return [];
  }

  const asked = triggers.filter((name) => !isFactionUpgrade(name));
  const neededByAnother = asked.filter((name) =>
    asked.some(
      (other) =>
        other.toLowerCase() !== name.toLowerCase() &&
        scene.upgradeNeeds?.[other.toLowerCase()]?.some(
          (need) => need.toLowerCase() === name.toLowerCase(),
        ),
    ),
  );
  const withOwnLook = asked.filter(
    (name) =>
      neededByAnother.includes(name) ||
      scene.upgrades.some(
        (each) =>
          each !== module &&
          (!each.requiresAllTriggers || each.triggers.length < 2) &&
          getKeys(cache, each).triggers.includes(name.toLowerCase()) &&
          changesLook(each),
      ),
  );

  return [withOwnLook, neededByAnother].find((list) => list.length < asked.length) ?? [];
};

export const listPrerequisites = (scene: ObjectScene, module: SceneUpgrade): string[] => {
  const cache = getCache(scene);
  let prerequisites = cache.prerequisites.get(module);

  if (!prerequisites) {
    prerequisites = findPrerequisites(scene, cache, module);
    cache.prerequisites.set(module, prerequisites);
  }
  return [...prerequisites];
};

export const listOwnTriggers = (scene: ObjectScene, module: SceneUpgrade): string[] => {
  const needed = listPrerequisites(scene, module);

  return module.triggers.filter((name) => !needed.includes(name));
};

const canKeysFire = (
  triggers: readonly string[],
  conflicts: readonly string[],
  requiresAllTriggers: boolean | undefined,
  active: ReadonlySet<string>,
) => {
  const isActive = (name: string) => active.has(name);

  if (!triggers.length || conflicts.some(isActive)) {
    return false;
  }
  return requiresAllTriggers ? triggers.every(isActive) : triggers.some(isActive);
};

export const canUpgradeFire = (
  { triggers, conflicts = [], requiresAllTriggers }: SceneUpgrade,
  active: ReadonlySet<string>,
): boolean =>
  canKeysFire(
    triggers.map((name) => name.toLowerCase()),
    conflicts.map((name) => name.toLowerCase()),
    requiresAllTriggers,
    active,
  );

const findWalk = (
  scene: ObjectScene,
  cache: WalkCache,
  picked: readonly string[],
): UpgradeWalk => {
  const active = new Set<string>();
  const created = scene.upgrades.filter((upgrade) => upgrade.startsActive);
  const fired = new Set(created);
  const give = (names: readonly string[], isPicked = false) => {
    const canFire = (upgrade: SceneUpgrade, arrived: ReadonlySet<string>) => {
      const { triggers, conflicts } = getKeys(cache, upgrade);

      if (canKeysFire(triggers, conflicts, upgrade.requiresAllTriggers, active)) {
        return true;
      }
      if (!isPicked || !upgrade.requiresAllTriggers || triggers.length < 2) {
        return false;
      }

      const needed = new Set(listPrerequisites(scene, upgrade).map((name) => name.toLowerCase()));
      const own = triggers.filter((name) => !needed.has(name));

      return own.some((name) => arrived.has(name)) && canKeysFire(own, conflicts, true, active);
    };
    const all: SceneUpgrade[] = [];
    let arriving = names;

    do {
      const arrived = new Set(arriving.map((name) => name.toLowerCase()));

      for (const name of arrived) {
        active.add(name);
      }

      const firing = scene.upgrades.filter(
        (upgrade) => !fired.has(upgrade) && canFire(upgrade, arrived),
      );

      firing.forEach((upgrade) => fired.add(upgrade));
      all.push(...firing);
      arriving = firing.flatMap((upgrade) => upgrade.grants ?? []);
    } while (arriving.length);
    return all;
  };

  const grants = scene.creationGrants ?? [];

  created.push(...give([...scene.heldUpgrades, ...created.flatMap((upgrade) => upgrade.grants ?? [])]));
  created.push(...give(grants.filter((grant) => !grant.isOnCompletion).map(({ name }) => name)));

  const firedByScripts = give(scene.created.grantedUpgrades.map(({ name }) => name));
  const firedOnCompletion = give(grants.filter((grant) => grant.isOnCompletion).map(({ name }) => name));

  created.push(...firedByScripts, ...firedOnCompletion);
  return {
    created,
    firedByScripts,
    firedOnCompletion,
    added: picked.flatMap((name) => give([name], true)),
    active,
  };
};

export const walkUpgrades = (
  scene: ObjectScene,
  picked: readonly string[] = [],
): UpgradeWalk => {
  const cache = getCache(scene);
  const key = picked.map((name) => name.toLowerCase()).join('\n');
  let walk = cache.walks.get(key);

  if (!walk) {
    if (cache.walks.size >= MAX_CACHED_WALKS) {
      cache.walks.clear();
    }
    walk = findWalk(scene, cache, picked);
    cache.walks.set(key, walk);
  }
  return walk;
};
