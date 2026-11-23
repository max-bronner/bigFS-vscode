import type { Vec3 } from '../../formats/w3d/w3dPose';
import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import {
  findIdleState,
  findOpeningAnimation,
  readStateConditions,
} from '../../game/objects/objectScene';
import type {
  ObjectScene,
  SceneFocus,
  SceneState,
} from '../../game/objects/objectScene';
import { listConditionalSubObjects } from '../../game/objects/subObjectRules';
import {
  findBodyDraw,
  isBodyShown,
  listWornRules,
  pickDrawShadow,
  pickPlayingClip,
  pickPlayingState,
} from '../../game/objects/drawStates';
import { listSubObjectSwitches } from '../../game/objects/partBindings';
import { findStandingState, pickShownModelState } from '../../game/objects/statePicks';
import { isSubObjectNamed } from '../../formats/w3d/w3dScene';
import { listHeldConditions, listTextureLayers } from '../../game/objects/objectAppearance';
import { listStateEffects } from '../../game/objects/listStateEffects';
import {
  changeBoundAppearance,
  followAppearance,
  getAppearance,
  isFollowingAppearance,
  listChangedLooks,
  pickStateLook,
  showAppearance,
} from './appearancePanel';
import { describeState } from '../../game/objects/groupStates';
import { showLookChips } from './lookChips';
import { showObjectHeader } from './objectHeader';
import type { ObjectDefinitionPlace } from './protocol';
import { listOwnChanges, listSwitchChanges } from './boundSwitches';
import { createClipRequests } from './createClipRequests';
import { findRedrawnState } from './findRedrawnState';
import { holdParts, setShownDraw } from './composedParts';
import { showMainModel } from './mainModel';
import { findClip, receiveClip } from './modelStore';
import { setMainShadow } from './shadowsView';
import { setMovement } from './turningWheels';
import { getDetail, offerDetail, onDetailPicked } from './detailLevel';
import type { EventClip } from './clipEvents';
import { showEffects } from './effectsPanel';
import { showStates } from './statePicker';
import { showVoices } from './voicesPanel';
import { $, onClipPicked, post, viewer } from './page';

export const objectView = {
  scene: undefined as ObjectScene | undefined,
  state: undefined as SceneState | undefined,
  picked: undefined as SceneState | undefined,
  actions: [] as string[],
  playing: undefined as SceneState | undefined,
  worn: undefined as SceneState | undefined,
  standing: undefined as string | undefined,
  clip: undefined as string | undefined,
  clipTiming: undefined as EventClip | undefined,
};

const isSameName = (a: string | undefined, b: string | undefined) =>
  a?.toLowerCase() === b?.toLowerCase();

export const getBonePosition = (name: string | undefined): Vec3 => {
  const skeleton = viewer.getModel()?.skeleton;
  const pose = viewer.getPose();
  const at = name
    ? (skeleton?.names.findIndex((each) => isSameName(each, name)) ?? -1)
    : -1;

  return at >= 0 && pose ? ([...pose.world[at].t] as Vec3) : [0, 0, 0];
};

const renderHiddenParts = () => {
  const { scene, state } = objectView;
  const conditional = scene ? listConditionalSubObjects(scene, state) : [];

  $('objectParts').textContent = conditional.length
    ? `Parts left as they are, for the running game decides: ${conditional.join(', ')}`
    : '';
};

const refreshLookChips = () => {
  const { picked } = objectView;

  showLookChips([
    ...listChangedLooks(),
    ...(picked
      ? [{ title: 'State', value: describeState(picked), fold: $<HTMLDetailsElement>('objectStatesSection') }]
      : []),
  ]);
};

export const refreshShownModel = (): void => {
  renderHiddenParts();
  viewer.restart();
};

const setLoadedAnimation = (
  name: string,
  animation: W3dAnimation | undefined,
  skeleton?: SceneSkeleton,
): void => {
  objectView.clipTiming = animation;
  if (animation) {
    viewer.playClip({ id: name, animation, skeleton });
  } else {
    viewer.clearClip(`The animation ${name} was not found or holds no animation`);
  }
};

const clipRequests = createClipRequests((name) => post({ kind: 'loadAnimation', name }));
const clipListeners: (() => void)[] = [];

export const onPanelClip = (listener: () => void): void => {
  clipListeners.push(listener);
};

const playAnimation = (name: string | undefined) => {
  clipListeners.forEach((listener) => listener());
  objectView.clip = name;
  objectView.clipTiming = undefined;
  if (!name) {
    viewer.clearClip();
    return;
  }

  const loaded = findClip(name);

  if (loaded !== undefined) {
    setLoadedAnimation(name, loaded?.animation, loaded?.skeleton);
  } else {
    clipRequests.ask(name);
  }
};

export const replayShownClip = (): void => playAnimation(objectView.clip);

export const receiveAnimation = (
  name: string,
  animation: W3dAnimation | undefined,
  skeleton: SceneSkeleton | undefined,
): void => {
  receiveClip(name, animation, skeleton);
  if (clipRequests.receive(name, objectView.clip)) {
    setLoadedAnimation(name, animation, skeleton);
  }
};

export const listShownConditions = (scene: ObjectScene): string[] => [
  ...new Set([...listHeldConditions(scene, getAppearance()), ...objectView.actions]),
];

const listEffects = (focus: SceneFocus = {}) => {
  const { scene, worn, playing } = objectView;

  if (scene) {
    const held = listShownConditions(scene);

    showEffects(listStateEffects(scene, worn, playing, held), focus);
    setMovement(scene, worn?.draw, [...held, ...(playing ? readStateConditions(playing) : [])]);
    viewer.restart();
  }
};

const hasModel = (state: SceneState | undefined) =>
  !!state?.model && !/^none$/i.test(state.model);

const resolveShown = (scene: ObjectScene, picked: SceneState | undefined) => {
  const bodyDraw = picked?.draw ?? findBodyDraw(scene);
  const body =
    scene.states.find(
      (each) => each.draw === bodyDraw && each.kind === 'model' && hasModel(each),
    ) ??
    picked ??
    scene.states[0];

  if (!body) {
    return {};
  }

  const held = listShownConditions(scene);
  const worn = pickShownModelState(scene, body.draw, held) ?? body;

  return {
    shown: picked?.kind === 'animation' ? { ...picked, model: worn.model } : worn,
    worn,
    held,
  };
};

const showLook = (scene: ObjectScene) => {
  const { picked } = objectView;
  const { shown, worn, held = [] } = resolveShown(scene, picked);
  const choice = getAppearance();
  const playing =
    picked?.kind === 'animation' ? picked : shown && pickPlayingState(scene, shown.draw, held);

  objectView.state = shown;
  objectView.worn = worn;
  setShownDraw(shown?.draw);
  objectView.standing = shown && pickPlayingClip(scene, shown.draw, held);
  viewer.setSubObjectRules(
    listWornRules(scene, worn, playing, held, choice.upgrades),
    !isFollowingAppearance(),
  );
  const hasDetailModels = !!shown && !!scene.detailDraws?.includes(shown.draw);

  offerDetail('mainHas', hasDetailModels);
  const isOn =
    !!picked || !shown || isBodyShown(scene, shown.draw, held, choice.upgrades);

  setMainShadow(
    shown && isOn ? pickDrawShadow(scene, shown.draw, worn) : undefined,
    scene.sun,
  );
  if (shown && isOn && hasModel(shown)) {
    showMainModel({
      name: shown.model!,
      textures: listTextureLayers(scene, shown.draw, worn, choice),
      detail: getDetail(hasDetailModels),
    });
  } else {
    showMainModel(undefined);
  }
  return shown;
};

const postShownState = (state: number | undefined) =>
  post({ kind: 'showState', state, conditions: objectView.actions });

const changeAppearance = () => {
  const scene = objectView.scene!;
  const { picked, state: before, standing, actions } = objectView;
  const choice = getAppearance();
  const held = listShownConditions(scene);

  post({ kind: 'setAppearance', choice });
  if (picked) {
    const next = findStandingState(scene, picked, held, actions);
    const at = next ? scene.states.indexOf(next) : undefined;

    if (next !== picked && at !== -1) {
      showStates(scene, at, pickByHand);
      pickState({ state: at });
      return;
    }
  }

  const shown = showLook(scene);

  if (
    !picked &&
    shown &&
    (!isSameName(shown.model, before?.model) || !isSameName(objectView.standing, standing))
  ) {
    const state = pickPlayingState(scene, shown.draw, held);
    const clip = objectView.standing;

    objectView.playing = state;
    viewer.showClipChoice(clip);
    playAnimation(clip);
  }
  listEffects();
  renderHiddenParts();
  refreshLookChips();
};

const pickState = (focus: SceneFocus) => {
  const scene = objectView.scene!;
  const state =
    focus.state === undefined ? undefined : scene.states[focus.state];
  const choices = state
    ? state.animations
    : scene.states.flatMap((each) => each.animations);
  objectView.picked = state;
  objectView.actions = [];
  if (state) {
    const { actions, isChanged } = pickStateLook(state);

    objectView.actions = actions;
    if (isChanged) {
      post({ kind: 'setAppearance', choice: getAppearance() });
    }
  }
  postShownState(focus.state);

  const shown = showLook(scene);
  const choice = getAppearance();
  const isChanged = !!(choice.upgrades?.length || choice.conditions?.length || choice.isSnowy);
  const first =
    focus.animation ??
    (state
      ? state.animations[0]
      : isChanged
        ? objectView.standing
        : findOpeningAnimation(scene, shown?.draw));

  const idle = shown && findIdleState(scene, shown.draw);
  const playsFirst = (each: SceneState | undefined) =>
    !!each?.animations.some((clip) => isSameName(clip, first));

  objectView.playing =
    state ??
    (!first || playsFirst(idle)
      ? idle
      : scene.states.find((each) => each.kind === 'animation' && playsFirst(each)));
  viewer.setClips({
    own: [...new Set(choices)].map((name) => ({ id: name, label: name })),
  });
  viewer.showClipChoice(first);
  playAnimation(first);
  listEffects(focus);
  renderHiddenParts();
  refreshLookChips();
};

const pickByHand = (state: number | undefined) => {
  followAppearance();
  pickState({ state });
};

onClipPicked((name) => {
  const { scene, playing } = objectView;

  if (scene && !playing?.animations.some((each) => isSameName(each, name))) {
    objectView.playing = scene.states.find(
      (each) =>
        each.kind === 'animation' && each.animations.some((clip) => isSameName(clip, name)),
    );
  }
  playAnimation(name);
  listEffects();
});

onDetailPicked(() => {
  if (objectView.scene) {
    showLook(objectView.scene);
  }
});

viewer.onPartSwitched((mesh, on, othersShown) => {
  const { scene } = objectView;

  if (!scene) {
    return;
  }

  const bound = listSubObjectSwitches(scene, getAppearance().upgrades);
  const changes = listOwnChanges(
    listSwitchChanges(bound.filter((each) => isSubObjectNamed(mesh, each.pattern)), on),
    bound.flatMap((each) =>
      each.hide && othersShown.some((other) => isSubObjectNamed(other, each.pattern))
        ? [each.hide]
        : [],
    ),
  );

  if (changes.length) {
    holdParts();
    viewer.holdParts();
  }
  changeBoundAppearance(changes);
});

let openedFocus = '';

const findRedrawnFocus = (before: ObjectScene, scene: ObjectScene, focus: SceneFocus): SceneFocus => {
  const { picked, clip } = objectView;
  const state = picked && findRedrawnState(before.states, picked, scene.states);
  const clips = state === undefined
    ? scene.states.flatMap((each) => each.animations)
    : scene.states[state].animations;

  return {
    ...focus,
    state,
    animation: clips.find((each) => isSameName(each, clip)),
  };
};

export const showObject = (
  scene: ObjectScene,
  focus: SceneFocus,
  definition?: ObjectDefinitionPlace,
): void => {
  const before = objectView.scene;
  const isRedrawn =
    isSameName(before?.name, scene.name) && openedFocus === JSON.stringify(focus);
  const shown = before && isRedrawn ? findRedrawnFocus(before, scene, focus) : focus;

  openedFocus = JSON.stringify(focus);
  objectView.scene = scene;
  $('objectLoading').hidden = true;
  $('object').hidden = false;
  $('editing').hidden = true;
  $('pickModel').hidden = true;
  $('bone').hidden = true;
  $('effectView').hidden = true;
  $<HTMLInputElement>('showVolume').checked = false;
  showObjectHeader(scene, definition);
  showVoices(scene);
  showAppearance(scene, changeAppearance);
  if (getAppearance().upgrades?.length) {
    post({ kind: 'setAppearance', choice: getAppearance() });
  }
  showStates(scene, shown.state, pickByHand, !isRedrawn);
  pickState(shown);
};
