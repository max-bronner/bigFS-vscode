import { pickModelState } from './objectAppearance';
import { pickShadow } from './objectShadows';
import type { ObjectShadow } from './objectShadows';
import { findIdleState, readStateConditions } from './objectScene';
import type { ObjectScene, SceneState, SceneUpgrade } from './objectScene';
import { listSubObjectRules } from './subObjectRules';
import type { ScriptedRule } from './subObjectScripts';
import { walkUpgrades } from './walkUpgrades';

export interface DrawGate {
  tag: string;
  isStartHidden: boolean;
  hiddenByConditions: string[];
  isFloor: boolean;
}

const DEFAULT_STATE = /^default/i;

export const readStateModel = (state: SceneState | undefined): string | undefined =>
  state?.model && !/^none$/i.test(state.model) ? state.model : undefined;

const toScriptGate = (tag: string): DrawGate => ({
  tag,
  isStartHidden: false,
  hiddenByConditions: [],
  isFloor: false,
});

export const findBodyDraw = (scene: ObjectScene): string | undefined => {
  const cache = getStateCache(scene);

  if (!cache.body) {
    const withModel = scene.states.filter((state) => readStateModel(state));
    const defaults = withModel.filter((state) => DEFAULT_STATE.test(state.label));
    const body =
      defaults.find((state) => isDrawShown(scene, toScriptGate(state.draw), [], [])) ??
      defaults[0] ??
      withModel[0];

    cache.body = { draw: body?.draw };
  }
  return cache.body.draw;
};

export const isBodyShown = (
  scene: ObjectScene,
  draw: string,
  held: readonly string[],
  picked: readonly string[] | undefined,
): boolean => {
  const gate = toScriptGate(draw);

  return isDrawShown(scene, gate, held, picked) || !isDrawShown(scene, gate, [], []);
};

export const pickDrawShadow = (
  scene: ObjectScene,
  draw: string,
  worn: SceneState | undefined,
): ObjectShadow | undefined =>
  pickShadow(
    scene.shadow,
    scene.states.find(
      (state) => state.draw === draw && state.kind === 'model' && DEFAULT_STATE.test(state.label),
    )?.shadow,
    worn?.shadow,
    draw === findBodyDraw(scene),
  );

export const listWornRules = (
  scene: ObjectScene,
  worn: SceneState | undefined,
  playing: SceneState | undefined,
  held: readonly string[],
  picked: readonly string[] = [],
) => {
  const scripted = playing
    ? { ...playing, model: worn?.model ?? playing.model, retainsSubObjects: worn?.retainsSubObjects }
    : worn;

  return listSubObjectRules(scene, scripted, picked, held);
};

interface MatchableState {
  state: SceneState;
  conditions: string[];
}

interface StateCache {
  states: readonly SceneState[];
  cliplessStates: readonly SceneState[] | undefined;
  upgrades: ObjectScene['upgrades'];
  heldUpgrades: ObjectScene['heldUpgrades'];
  created: ObjectScene['created'];
  creationGrants: ObjectScene['creationGrants'];
  animationStates: Map<string, MatchableState[]>;
  idles?: { states: Map<string, SceneState | undefined>; writes: ScriptedRule[] };
  body?: { draw: string | undefined };
}

const stateCaches = new WeakMap<ObjectScene, StateCache>();

const getStateCache = (scene: ObjectScene): StateCache => {
  const cache = stateCaches.get(scene);

  if (
    cache &&
    cache.states === scene.states &&
    cache.cliplessStates === scene.cliplessStates &&
    cache.upgrades === scene.upgrades &&
    cache.heldUpgrades === scene.heldUpgrades &&
    cache.created === scene.created &&
    cache.creationGrants === scene.creationGrants
  ) {
    return cache;
  }

  const fresh: StateCache = {
    states: scene.states,
    cliplessStates: scene.cliplessStates,
    upgrades: scene.upgrades,
    heldUpgrades: scene.heldUpgrades,
    created: scene.created,
    creationGrants: scene.creationGrants,
    animationStates: new Map(),
  };

  stateCaches.set(scene, fresh);
  return fresh;
};

const listAnimationStates = (scene: ObjectScene, draw: string): readonly MatchableState[] => {
  const cache = getStateCache(scene);
  let states = cache.animationStates.get(draw);

  if (!states) {
    states = [...scene.states, ...(scene.cliplessStates ?? [])]
      .filter(
        (state) =>
          state.draw === draw &&
          state.kind === 'animation' &&
          !state.isImplied &&
          !/^transitionstate/i.test(state.label),
      )
      .sort((a, b) => (a.line ?? 0) - (b.line ?? 0))
      .map((state) => ({
        state,
        conditions: readStateConditions(state).filter((each) => each !== 'NONE'),
      }));
    cache.animationStates.set(draw, states);
  }
  return states;
};

const pickBestMatch = (
  states: readonly MatchableState[],
  held: ReadonlySet<string>,
): SceneState | undefined => {
  let best: SceneState | undefined;
  let bestCount = -1;

  for (const { state, conditions } of states) {
    if (conditions.length > bestCount && conditions.every((each) => held.has(each))) {
      best = state;
      bestCount = conditions.length;
    }
  }
  return best;
};

const toHeld = (held: readonly string[]) => new Set(held.map((each) => each.toUpperCase()));

export const pickPlayingState = (
  scene: ObjectScene,
  draw: string,
  held: readonly string[],
): SceneState | undefined => pickBestMatch(listAnimationStates(scene, draw), toHeld(held));

export const pickPlayingClip = (
  scene: ObjectScene,
  draw: string,
  held: readonly string[],
): string | undefined => {
  const states = listAnimationStates(scene, draw);
  const conditions = toHeld(held);
  const playing = pickBestMatch(states, conditions);

  if (playing?.animations.length) {
    return playing.animations[0];
  }

  const own = scene.states.filter((state) => state.draw === draw);
  const worn = readStateModel(pickModelState(own, conditions))?.toLowerCase();
  const body = readStateModel(pickModelState(own, new Set()))?.toLowerCase();

  return worn === body
    ? pickBestMatch(
        states.filter(({ state }) => state.animations.length),
        conditions,
      )?.animations[0]
    : undefined;
};

const listNamingWrites = (rules: readonly ScriptedRule[]) =>
  rules.filter((rule) => !rule.isPermanent || rule.target === 'module');

const listIdles = (scene: ObjectScene) => {
  const cache = getStateCache(scene);

  if (!cache.idles) {
    const states = new Map<string, SceneState | undefined>();
    const writes: ScriptedRule[] = [];

    for (const { draw } of [...scene.states, ...(scene.cliplessStates ?? [])]) {
      if (!states.has(draw)) {
        const idle = pickPlayingState(scene, draw, []) ?? findIdleState(scene, draw);

        states.set(draw, idle);
        writes.push(...listNamingWrites(idle?.subObjects.rules ?? []));
      }
    }
    cache.idles = { states, writes };
  }
  return cache.idles;
};

const isSwitchedOn = (
  scene: ObjectScene,
  gate: DrawGate,
  held: readonly string[],
  picked: readonly string[] | undefined,
) => {
  const { created, added } = walkUpgrades(scene, picked);
  const idles = listIdles(scene);
  const conditions = toHeld(held);
  const playing: ScriptedRule[] = [];

  for (const [draw, idle] of idles.states) {
    const state = pickBestMatch(listAnimationStates(scene, draw), conditions);

    if (state && state !== idle) {
      playing.push(...listNamingWrites(state.subObjects.rules));
    }
  }

  let isOn = !gate.isStartHidden;
  const tag = gate.tag.toLowerCase();
  const isNamed = (pattern: string) => pattern.toLowerCase() === tag;
  const fire = (modules: readonly SceneUpgrade[]) => {
    for (const { shows, hides } of modules) {
      if (hides.some(isNamed)) {
        isOn = false;
      }
      if (shows.some(isNamed)) {
        isOn = true;
      }
    }
  };
  const write = (rules: readonly ScriptedRule[]) => {
    for (const rule of rules) {
      if (isNamed(rule.pattern)) {
        isOn = !rule.hide;
      }
    }
  };

  fire(created);
  write(scene.created.rules.filter((rule) => rule.isPermanent && rule.hide));
  write(idles.writes);
  fire(added);
  write(playing);
  return isOn;
};

export const isDrawShown = (
  scene: ObjectScene,
  gate: DrawGate,
  held: readonly string[],
  picked: readonly string[] | undefined,
): boolean => {
  const conditions = toHeld(held);

  if (gate.hiddenByConditions.some((each) => conditions.has(each))) {
    return false;
  }
  if (!gate.isFloor) {
    const state = pickModelState(
      scene.states.filter((each) => each.draw === gate.tag),
      conditions,
    );

    if (state && !readStateModel(state)) {
      return false;
    }
  }
  return isSwitchedOn(scene, gate, held, picked);
};
