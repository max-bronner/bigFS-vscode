import { isDrawShown, readStateModel } from './drawStates';
import type { DrawGate } from './drawStates';
import { getRaisedConditions, listHeldConditions, pickModelState } from './objectAppearance';
import type { AppearanceChoice } from './objectAppearance';
import { readStateConditions } from './objectScene';
import type { ObjectScene, SceneUpgrade } from './objectScene';
import {
  isFactionUpgrade,
  listOwnTriggers,
  listPrerequisites,
  walkUpgrades,
} from './walkUpgrades';

export type PartRole =
  | 'always'
  | 'upgrade'
  | 'state';

export interface AppearanceChange {
  give?: string[];
  take?: string[];
  hold?: string[];
  release?: string[];
  level?: number;
  belowLevel?: number;
}

export interface PartBinding {
  role: PartRole;
  addedBy?: AppearanceChange;
  needs?: string[];
  show?: AppearanceChange;
  hide?: AppearanceChange;
}

export interface SubObjectSwitch {
  pattern: string;
  show?: AppearanceChange;
  hide?: AppearanceChange;
}

const MAX_CANDIDATES = 64;


const getGivenTriggers = (scene: ObjectScene, module: SceneUpgrade): string[] => {
  if (module.requiresAllTriggers) {
    return listOwnTriggers(scene, module);
  }

  const first = module.triggers.find((name) => !isFactionUpgrade(name)) ?? module.triggers[0];

  return first === undefined ? [] : [first];
};

export const listSourcesOf = (scene: ObjectScene, name: string): string[] => [
  name,
  ...scene.upgrades
    .filter((module) => module.grants?.some((each) => each.toLowerCase() === name.toLowerCase()))
    .flatMap((module) => module.triggers),
];

const getTakenTriggers = (
  scene: ObjectScene,
  module: SceneUpgrade,
  picked: readonly string[],
): string[] => {
  const getPicked = (name: string) =>
    listSourcesOf(scene, name).filter((each) => picked.some((given) => given.toLowerCase() === each.toLowerCase()));
  const given = listOwnTriggers(scene, module).filter((name) => getPicked(name).length);

  if (!module.requiresAllTriggers) {
    return given.flatMap(getPicked);
  }

  const taken = given.find((name) => !isFactionUpgrade(name)) ?? given[0];

  return taken === undefined ? [] : getPicked(taken);
};

const fireModule = (
  scene: ObjectScene,
  module: SceneUpgrade,
  picked: readonly string[],
): AppearanceChange => {
  const take = (module.conflicts ?? []).filter((name) => picked.some((each) => each.toLowerCase() === name.toLowerCase()));

  return { give: getGivenTriggers(scene, module), ...(take.length ? { take } : {}) };
};

const listNeeds = (scene: ObjectScene, change: AppearanceChange | undefined): string[] => {
  const given = change?.give ?? [];
  const needs = new Map<string, string>();

  for (const name of given) {
    const modules = scene.upgrades.filter((module) =>
      listOwnTriggers(scene, module).some((each) => each.toLowerCase() === name.toLowerCase()),
    );

    for (const need of [
      ...modules.flatMap((module) => listPrerequisites(scene, module)),
      ...(scene.upgradeNeeds?.[name.toLowerCase()] ?? []),
    ]) {
      if (!given.some((each) => each.toLowerCase() === need.toLowerCase())) {
        needs.set(need.toLowerCase(), need);
      }
    }
  }
  return [...needs.values()];
};

export const getConditionsChange = (
  scene: ObjectScene,
  conditions: readonly string[],
  choice: AppearanceChoice = {},
): AppearanceChange =>
  getChangeFromHeld(scene, conditions, new Set(listHeldConditions(scene, choice)));

const getChangeFromHeld = (
  scene: ObjectScene,
  conditions: readonly string[],
  held: ReadonlySet<string>,
): AppearanceChange => {
  const give: string[] = [];
  const hold: string[] = [];

  for (const condition of conditions) {
    if (held.has(condition) || condition === 'NONE') {
      continue;
    }

    const module = scene.upgrades.find((each) => getRaisedConditions(each).includes(condition));

    if (module) {
      give.push(...getGivenTriggers(scene, module));
    } else {
      hold.push(condition);
    }
  }
  return {
    ...(give.length ? { give: [...new Set(give)] } : {}),
    ...(hold.length ? { hold } : {}),
  };
};

export const applyChange = (choice: AppearanceChoice, change: AppearanceChange): AppearanceChoice => {
  const drop = (from: readonly string[] | undefined, names: readonly string[] | undefined) =>
    (from ?? []).filter((each) => !names?.some((name) => each.toLowerCase() === name.toLowerCase()));
  const upgrades = drop(choice.upgrades, change.take);

  for (const name of change.give ?? []) {
    if (!upgrades.some((each) => each.toLowerCase() === name.toLowerCase())) {
      upgrades.push(name);
    }
  }
  return {
    ...choice,
    upgrades,
    conditions: [...drop(choice.conditions, change.release), ...(change.hold ?? [])],
  };
};

const isGateShown = (scene: ObjectScene, gate: DrawGate, choice: AppearanceChoice) =>
  isDrawShown(scene, gate, listHeldConditions(scene, choice), choice.upgrades);

const findShowChange = (
  scene: ObjectScene,
  gate: DrawGate,
  choice: AppearanceChoice,
): AppearanceChange | undefined => {
  const picked = choice.upgrades ?? [];
  const isTag = (name: string) => name.toLowerCase() === gate.tag.toLowerCase();
  const { created, added } = walkUpgrades(scene, picked);
  const candidates: AppearanceChange[] = [];
  const naming = scene.upgrades.filter((module) => module.shows.some(isTag));

  for (const module of naming) {
    candidates.push(fireModule(scene, module, picked));
  }
  for (const module of added.filter((each) => each.hides.some(isTag))) {
    candidates.push({ take: getTakenTriggers(scene, module, picked) });
  }

  const blocking = (choice.conditions ?? []).filter((each) =>
    gate.hiddenByConditions.includes(each.toUpperCase()),
  );

  if (blocking.length) {
    candidates.push({ release: blocking });
  }

  const temporary = new Set(scene.upgrades.flatMap((module) => module.raisesTemporarily ?? []));
  const held = new Set(listHeldConditions(scene, choice));
  const reached = [
    ...scene.states.filter(
      (state) => state.draw === gate.tag && state.kind === 'model' && readStateModel(state),
    ),
    ...[...scene.states, ...(scene.cliplessStates ?? [])].filter(
      (state) =>
        state.kind === 'animation' &&
        state.subObjects.rules.some((rule) => !rule.hide && isTag(rule.pattern)),
    ),
  ]
    .map((state) => {
      const conditions = readStateConditions(state);
      const change = getChangeFromHeld(scene, conditions, held);

      return {
        change,
        passing: conditions.filter((each) => temporary.has(each)).length,
        held: change.hold?.length ?? 0,
        size: conditions.length,
      };
    })
    .sort((a, b) => a.passing - b.passing || a.held - b.held || a.size - b.size)
    .map(({ change }) => change);

  for (const change of reached) {
    candidates.push(change);
    for (const module of naming) {
      if (!created.includes(module) && !added.includes(module)) {
        candidates.push({
          ...change,
          give: [...(change.give ?? []), ...getGivenTriggers(scene, module)],
        });
      }
    }
  }
  return candidates
    .slice(0, MAX_CANDIDATES)
    .find((change) => isGateShown(scene, gate, applyChange(choice, change)));
};

const findHideChange = (
  scene: ObjectScene,
  gate: DrawGate,
  choice: AppearanceChoice,
): AppearanceChange | undefined => {
  const picked = choice.upgrades ?? [];
  const { added } = walkUpgrades(scene, picked);
  const candidates: AppearanceChange[] = [];

  for (const module of [...added].reverse()) {
    if (module.shows.some((name) => name.toLowerCase() === gate.tag.toLowerCase())) {
      candidates.push({ take: getTakenTriggers(scene, module, picked) });
    }
  }
  if (!gate.isFloor) {
    const own = scene.states.filter((state) => state.draw === gate.tag);
    const held = listHeldConditions(scene, choice);
    const worn = pickModelState(own, new Set(held));

    for (const condition of worn ? readStateConditions(worn) : []) {
      const without = new Set(held.filter((each) => each !== condition));
      const next = pickModelState(own, without);

      if (!next || readStateModel(next)) {
        continue;
      }

      const raising = added.filter((module) => getRaisedConditions(module).includes(condition));

      candidates.push(
        raising.length
          ? { take: raising.flatMap((module) => getTakenTriggers(scene, module, picked)) }
          : { release: [condition] },
      );
    }
  }
  for (const module of [...added].reverse()) {
    if (getRaisedConditions(module).length) {
      candidates.push({ take: getTakenTriggers(scene, module, picked) });
    }
  }
  for (const condition of choice.conditions ?? []) {
    candidates.push({ release: [condition] });
  }
  return candidates
    .slice(0, MAX_CANDIDATES)
    .find((change) => !isGateShown(scene, gate, applyChange(choice, change)));
};

export const bindDraw = (
  scene: ObjectScene,
  gate: DrawGate,
  choice: AppearanceChoice,
): { isShown: boolean; binding: PartBinding } => {
  const isShown = isGateShown(scene, gate, choice);
  const show = isShown ? undefined : findShowChange(scene, gate, choice);
  const hide = isShown ? findHideChange(scene, gate, choice) : undefined;
  const isFromCreation = isGateShown(scene, gate, {});
  const addedBy = isFromCreation ? undefined : findShowChange(scene, gate, {});
  const role = isFromCreation ? 'always' : addedBy?.give?.length ? 'upgrade' : 'state';
  const needs = listNeeds(scene, addedBy);

  return {
    isShown,
    binding: {
      role,
      ...(addedBy ? { addedBy } : {}),
      ...(needs.length ? { needs } : {}),
      ...(show ? { show } : {}),
      ...(hide ? { hide } : {}),
    },
  };
};

export const bindSpawn = (
  scene: ObjectScene,
  modules: readonly SceneUpgrade[],
  picked: readonly string[] = [],
): { isShown: boolean; binding: PartBinding } => {
  const { created, added, active: given } = walkUpgrades(scene, picked);
  const fired = new Set([...created, ...added]);
  const firing = modules.find((module) => fired.has(module));
  const isFromCreation = modules.some((module) => created.includes(module));
  const nearest = [...modules].sort(
    (a, b) =>
      getGivenTriggers(scene, a).filter((name) => !given.has(name.toLowerCase())).length -
      getGivenTriggers(scene, b).filter((name) => !given.has(name.toLowerCase())).length,
  )[0];
  const take = firing && added.includes(firing) ? getTakenTriggers(scene, firing, picked) : [];
  const addedBy = isFromCreation ? undefined : fireModule(scene, modules[0], []);
  const needs = listNeeds(scene, addedBy);

  return {
    isShown: !!firing,
    binding: {
      role: isFromCreation ? 'always' : 'upgrade',
      ...(addedBy ? { addedBy } : {}),
      ...(needs.length ? { needs } : {}),
      ...(firing ? {} : { show: fireModule(scene, nearest, picked) }),
      ...(take.length ? { hide: { take } } : {}),
    },
  };
};

export const listSubObjectSwitches = (
  scene: ObjectScene,
  picked: readonly string[] = [],
): SubObjectSwitch[] => {
  const { created, added } = walkUpgrades(scene, picked);
  const switches: SubObjectSwitch[] = [];

  for (const module of scene.upgrades) {
    if (created.includes(module)) {
      continue;
    }
    if (added.includes(module)) {
      const take = getTakenTriggers(scene, module, picked);

      if (take.length) {
        switches.push(
          ...module.shows.map((pattern) => ({ pattern, hide: { take } })),
          ...module.hides
            .filter((pattern) => !module.shows.some((shown) => shown.toLowerCase() === pattern.toLowerCase()))
            .map((pattern) => ({ pattern, show: { take } })),
        );
      }
    } else if (module.triggers.length) {
      const show = fireModule(scene, module, picked);

      switches.push(...module.shows.map((pattern) => ({ pattern, show })));
    }
  }
  return switches;
};
