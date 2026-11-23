import type { AppearanceControls } from './appearanceControls';
import { applyPicks, getChoice } from './appearancePicks';
import type { AppearancePicks } from './appearancePicks';
import { pickPlayingState, readStateModel } from './drawStates';
import { getRaisedConditions, listHeldConditions, pickModelState } from './objectAppearance';
import { readStateConditions } from './objectScene';
import type { ObjectScene, SceneState } from './objectScene';
import { getConditionsChange } from './partBindings';

const MAX_RELEASES = 8;

const listConditions = (state: SceneState) =>
  readStateConditions(state).filter((each) => each !== 'NONE');

export const listPickedConditions = (
  scene: ObjectScene,
  controls: AppearanceControls | undefined,
  picks: AppearancePicks,
  actions: readonly string[],
): string[] => [
  ...new Set([...listHeldConditions(scene, getChoice(controls, picks)), ...actions]),
];

const releaseOutrankingLooks = (
  scene: ObjectScene,
  controls: AppearanceControls,
  picks: AppearancePicks,
  state: SceneState,
  actions: readonly string[],
  select: (held: readonly string[]) => SceneState | undefined,
) => {
  const wanted = new Set(listConditions(state));

  for (let round = 0; round < MAX_RELEASES; round++) {
    const held = listPickedConditions(scene, controls, picks, actions);
    const selected = select(held);

    if (!selected || selected === state) {
      return;
    }

    const extra = listConditions(selected).filter((each) => !wanted.has(each) && held.includes(each));
    const before = JSON.stringify(getChoice(controls, picks));

    for (const condition of extra) {
      const raising = scene.upgrades.filter((module) => getRaisedConditions(module).includes(condition));
      const take = picks.upgrades.filter((name) =>
        raising.some((module) => module.triggers.some((each) => each.toLowerCase() === name.toLowerCase())),
      );

      applyPicks(controls, picks, { release: [condition], ...(take.length ? { take } : {}) });
    }
    if (JSON.stringify(getChoice(controls, picks)) === before) {
      return;
    }
  }
};

export const applyStatePick = (
  scene: ObjectScene,
  controls: AppearanceControls,
  picks: AppearancePicks,
  state: SceneState,
): string[] => {
  const conditions = listConditions(state);

  applyPicks(controls, picks, getConditionsChange(scene, conditions, getChoice(controls, picks)));

  const held = new Set(listHeldConditions(scene, getChoice(controls, picks)));
  const actions = conditions.filter((each) => !held.has(each));

  if (state.kind === 'model') {
    const own = scene.states.filter((each) => each.draw === state.draw);

    releaseOutrankingLooks(scene, controls, picks, state, actions, (heldNow) =>
      pickModelState(own, new Set(heldNow)),
    );
  } else if (pickPlayingState(scene, state.draw, conditions) === state) {
    releaseOutrankingLooks(scene, controls, picks, state, actions, (heldNow) =>
      pickPlayingState(scene, state.draw, heldNow),
    );
  }
  return actions;
};

export const findStandingState = (
  scene: ObjectScene,
  picked: SceneState,
  held: readonly string[],
  actions: readonly string[],
): SceneState | undefined => {
  const conditions = new Set(held.map((each) => each.toUpperCase()));

  if (picked.kind === 'model') {
    const worn = pickModelState(
      scene.states.filter((each) => each.draw === picked.draw),
      conditions,
    );

    return worn === picked ? picked : undefined;
  }
  if (listConditions(picked).every((each) => conditions.has(each))) {
    const playing = pickPlayingState(scene, picked.draw, held);
    const isSelectable = pickPlayingState(scene, picked.draw, listConditions(picked)) === picked;

    return isSelectable && playing ? playing : picked;
  }
  return actions.length ? pickPlayingState(scene, picked.draw, held) : undefined;
};

export const pickShownModelState = (
  scene: ObjectScene,
  draw: string,
  held: readonly string[],
): SceneState | undefined => {
  const own = scene.states.filter((state) => state.draw === draw);
  const selected = pickModelState(own, new Set(held.map((each) => each.toUpperCase())));

  if (readStateModel(selected) || (selected && selected !== pickModelState(own, new Set()))) {
    return selected;
  }
  return own.find((state) => state.kind === 'model' && readStateModel(state)) ?? selected;
};
