import { describeCondition } from './objectEffects';
import { readStateConditions } from './objectScene';
import type { SceneState } from './objectScene';

export interface ListedState {
  at: number;
  state: SceneState;
  title: string;
}

export interface StateGroup {
  title: string;
  states: ListedState[];
}

const MODEL_GROUP = 'Model states';
const TRANSITION_GROUP = 'Transitions';
const OTHER_GROUP = 'Other';

const PURPOSES: readonly [string, RegExp][] = [
  ['Death', /^(DYING|DEATH_|DECAY|SPLATTED|BURNINGDEATH|FREEFALL)/],
  [
    'Construction',
    /CONSTRUCT|^(JUST_BUILT|BUILD_PLACEMENT|SOLD|PHANTOM|BASE_BUILD)/,
  ],
  [
    'Attack',
    /FIRING|ATTACK|RELOAD|^(USING_WEAPON|WEAPONSTATE|CHARGING)/,
  ],
  ['Abilities', /^(SPECIAL_|USING_|RAISING|PACKING|UNPACKING|PREPARING|SWAPPING)|ABILITY/],
  ['Doors and production', /^(DOOR_|COMING_OUT_OF|DEPLOY)/],
  ['Movement', /^(MOVING|TURN_|BACKING|ACCELERATE|DECELERATE|CLIMBING|WADING|WANDER|RAPPELLING)/],
  ['Damage', /DAMAGED|RUBBLE|COLLAPS|^(POST_|DESTROYED_|BURNED|AFLAME)/],
  ['Reactions and emotions', /^(EMOTION|STUNNED|HIT_|SELECTED|ENGAGED|THROWN|BACK_AWAY|RUN_AWAY)/],
  ['Riding and garrison', /^(PASSENGER|GARRISON|MOUNTED)/],
];

const IDLE_GROUP = 'Idle';
const LISTED = [
  IDLE_GROUP,
  'Movement',
  'Attack',
  'Abilities',
  'Reactions and emotions',
  'Riding and garrison',
  'Doors and production',
  'Construction',
  'Damage',
  'Death',
  OTHER_GROUP,
  MODEL_GROUP,
  TRANSITION_GROUP,
];

const isTransition = (state: SceneState) => /^transitionstate/i.test(state.label);

const getGroup = (state: SceneState, whileBuilding: ReadonlySet<string>) => {
  if (isTransition(state)) {
    return TRANSITION_GROUP;
  }
  if (state.kind === 'model') {
    return MODEL_GROUP;
  }

  const conditions = readStateConditions(state).filter((each) => each !== 'NONE');

  if (!conditions.length) {
    return IDLE_GROUP;
  }
  if (conditions.some((each) => whileBuilding.has(each))) {
    return 'Construction';
  }
  return (
    PURPOSES.find(([, pattern]) => conditions.some((each) => pattern.test(each)))?.[0] ??
    OTHER_GROUP
  );
};

export const describeState = (state: SceneState): string => {
  if (isTransition(state)) {
    return state.label
      .replace(/^\S+\s*=?\s*/, '')
      .replace(/^TRANS_/i, '')
      .replace(/_/g, ' ');
  }

  const conditions = readStateConditions(state).filter((each) => each !== 'NONE');

  if (conditions.length) {
    return conditions.map(describeCondition).join(', ');
  }
  return state.kind === 'model' ? 'default' : 'idle';
};

export const groupStates = (
  states: readonly SceneState[],
  query = '',
  whileBuilding: ReadonlySet<string> = new Set(),
): StateGroup[] => {
  const groups = new Map<string, ListedState[]>(LISTED.map((title) => [title, []]));
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  states.forEach((state, at) => {
    const title = describeState(state);
    const searched = [
      title,
      state.label,
      state.name ?? '',
      ...state.animations,
      ...state.fx,
      ...state.particles.map((each) => each.system),
      ...(state.fxEvents ?? []).map((each) => each.name),
      ...(state.kind === 'model' && state.model ? [state.model] : []),
    ]
      .join(' ')
      .toLowerCase();

    if (words.every((word) => searched.includes(word))) {
      groups.get(getGroup(state, whileBuilding))!.push({ at, state, title });
    }
  });
  return [...groups].flatMap(([title, listed]) =>
    listed.length ? [{ title, states: listed }] : [],
  );
};
