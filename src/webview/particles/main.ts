import { forgetDecals, receiveDecal, setGroundColour } from './shadowsView';
import { pageSoundPlayer } from '../shared/pageSoundPlayer';
import { getEffectStateAt } from '../../formats/particles/fxEffects';
import { scaleEffect } from '../../formats/particles/particleScale';
import { STEP_HZ } from '../../formats/particles/particleSimulation';
import { attachment, getModelOrigin, getRootOrigin } from './emitterOrigin';
import { renderCurves } from './curves';
import { renderFields } from './fields';
import { attachHandles, drawHandles } from './handles';
import { attachMove } from './moveModel';
import { resetStats, sampleStats, showStats } from './stats';
import {
  drawTimeline,
  getTimelineSeconds,
  listEffects,
  renderTimeline,
  skipDueSounds,
} from './timeline';
import { drawSystems, hasGraphics, loadTextures } from './graphics';
import { $, library, post, state, viewer, world } from './page';
import { getNextEventStep } from './clipEvents';
import { listEnabledEffects } from './effectsPanel';
import { showAbilities } from './abilitiesPanel';
import {
  advanceAbility,
  getAbilitySeconds,
  isAbilityPlaying,
  listAbilityEffects,
  syncAbilityClip,
} from './abilityPlayback';
import type { AbilityPlayedEffect } from './abilityPlayback';
import type { Effect } from './effectsPanel';
import {
  getBonePosition,
  objectView,
  refreshShownModel,
  receiveAnimation,
  showObject,
} from './objectPanel';
import { getPartBonePoint, showComposition } from './composedParts';
import { onMainModel } from './mainModel';
import { forgetLoaded, forgetTextures, receiveClip, receiveModel } from './modelStore';
import { planPreload, receivePreloadPlan } from './preloading';
import { poseAt } from '../../formats/w3d/w3dPose';
import type { Pose, Vec3 } from '../../formats/w3d/w3dPose';
import type { ModelScene } from '../../formats/w3d/w3dScene';
import type { ViewerCamera } from '../shared/viewer/createViewer';
import type { ToPage } from './protocol';
import { pushRing, estimateReach, pushVolumeLines } from './volume';

const MAX_FRAME_STEPS = 8;
const MAX_SEEK_STEPS = 1800;
const LOOP_PAUSE = 0.6;
const OPEN_ENDED_FRAMES = STEP_HZ * 4;
const MIN_EFFECT_FRAMES = STEP_HZ * 2;
const REACH_DISTANCE = 2.2;
const DISTANCE_RADII = 2.6;
const DEFAULT_DISTANCE = 260;

const hud = $('hud');
const isChecked = (id: string) => $<HTMLInputElement>(id).checked;

if (!hasGraphics) {
  hud.textContent =
    'WebGL is not available here, so nothing is drawn; the simulation still runs.';
}

let attached: (Pick<Effect, 'bone' | 'part' | 'offset'> & { id: number })[] = [];
let waitingForPart: Effect[] = [];
let delayed: Effect[] = [];
let delayedSeconds = 0;
let clipEvents: { effect: Effect; frame: number }[] = [];
let scheduledStops: { id: number; step: number }[] = [];
let abilityEffects = new Set<Effect>();
const abilitySystems = new Set<number>();

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

let lastBusyTime = 0;

const getEffectOrigin = ({ bone, part, offset }: Pick<Effect, 'bone' | 'part' | 'offset'>): Vec3 | undefined => {
  if (offset) {
    return add(getModelOrigin(), offset);
  }
  return part === undefined ? add(getModelOrigin(), getBonePosition(bone)) : getPartBonePoint(part, bone);
};

const startEffect = (effect: AbilityPlayedEffect) => {
  const { kind, name, bone, part, offset, until } = effect;
  const origin = getEffectOrigin(effect);

  if (!origin) {
    return [];
  }

  const ids = (kind === 'fxList' ? world.fire(name, origin) : [world.spawn(name, origin)]).flatMap((id) =>
    id === undefined ? [] : [id],
  );

  if (until !== undefined) {
    scheduledStops.push(...ids.map((id) => ({ id, step: Math.round(until * STEP_HZ) })));
  }
  if (abilityEffects.has(effect)) {
    ids.forEach((id) => abilitySystems.add(id));
  }
  return ids.map((id) => ({ id, bone, part, offset }));
};

const fireDueEffects = () => {
  const step = world.frame;
  const due = clipEvents.flatMap(({ effect, frame }) =>
    getNextEventStep(frame, step - 1, STEP_HZ, objectView.clipTiming) === step ? [effect] : [],
  );

  if (!due.length) {
    return;
  }
  const alive = new Set(world.systems.map((system) => system.id));

  attached = attached.filter(({ id }) => alive.has(id));
  state.roots = state.roots.filter((id) => alive.has(id));
  for (const started of due.flatMap(startEffect)) {
    attached.push(started);
    state.roots.push(started.id);
  }
};

const startEffects = () => {
  world.clear();
  clipEvents = [];
  scheduledStops = [];
  abilitySystems.clear();
  waitingForPart = [];
  delayed = [];
  delayedSeconds = 0;
  lastBusyTime = 0;
  resetStats();

  const scene = state.scene;

  if (!scene) {
    return;
  }

  if (objectView.scene) {
    const shown = listEnabledEffects().filter((effect) => !isAbilityPlaying() || effect.frame === undefined);
    abilityEffects = new Set(listAbilityEffects());

    const enabled: AbilityPlayedEffect[] = [...shown, ...abilityEffects];

    clipEvents = enabled.flatMap((effect) =>
      effect.frame === undefined ? [] : [{ effect, frame: effect.frame }],
    );
    delayed = enabled.filter((effect) => effect.frame === undefined && effect.delay);
    delayedSeconds = Math.max(0, ...delayed.map(({ delay = 0 }) => delay));

    const lasting = enabled.filter((effect) => effect.frame === undefined && !effect.delay);

    waitingForPart = lasting.filter((effect) => !getEffectOrigin(effect));
    attached = lasting.filter((effect) => !waitingForPart.includes(effect)).flatMap(startEffect);
    state.roots = attached.map((each) => each.id);
    return;
  }
  if (!scene.root) {
    return;
  }

  const origin = getRootOrigin();

  state.roots =
    scene.root.kind === 'fxList'
      ? world.fire(scene.root.name, origin)
      : [world.spawn(scene.root.name, origin)].filter(
          (id): id is number => id !== undefined,
        );
};

const stepOnce = () => {
  const origin = getRootOrigin();

  if (objectView.scene) {
    fireDueEffects();
    if (scheduledStops.length) {
      const due = scheduledStops.filter(({ step }) => world.frame >= step);

      due.forEach(({ id }) => world.stop(id));
      scheduledStops = scheduledStops.filter((each) => !due.includes(each));
    }
    if (delayed.length) {
      const due = delayed.filter(({ delay = 0 }) => world.frame >= Math.round(delay * STEP_HZ));

      delayed = delayed.filter((effect) => !due.includes(effect));
      waitingForPart.push(...due);
    }
    if (waitingForPart.length) {
      const ready = waitingForPart.filter((effect) => getEffectOrigin(effect));

      waitingForPart = waitingForPart.filter((effect) => !ready.includes(effect));
      for (const started of ready.flatMap(startEffect)) {
        attached.push(started);
        state.roots.push(started.id);
      }
    }
    for (const each of attached) {
      const { id } = each;
      const origin = getEffectOrigin(each);

      if (origin) {
        world.setOrigin(id, origin);
      }
    }
  } else {
    for (const id of state.roots) {
      world.setOrigin(id, origin);
    }
  }
  world.step();
  for (const system of world.systems.filter(({ id }) => abilitySystems.has(id))) {
    [system.slave, ...system.particles.map((particle) => particle.attached)].forEach(
      (id) => id !== undefined && abilitySystems.add(id),
    );
  }
  sampleStats();
};

const stepTo = (time: number, maxSteps: number) => {
  const due = Math.floor(time * STEP_HZ);

  for (let steps = 0; world.frame < due && steps < maxSteps; steps++) {
    stepOnce();
  }
  if (world.systems.length) {
    lastBusyTime = time;
  }
};

const getEffectSeconds = (): number => {
  const scene = state.scene;

  if (!scene) {
    return 0;
  }
  if (getAbilitySeconds()) {
    return getAbilitySeconds();
  }
  const delayedLength = delayedSeconds > 0 ? delayedSeconds + OPEN_ENDED_FRAMES / STEP_HZ : 0;

  if (clipEvents.length) {
    const last = Math.max(...clipEvents.map(({ frame }) => frame));
    const rate = objectView.clipTiming?.frameRate || STEP_HZ;

    return Math.max(last / rate + OPEN_ENDED_FRAMES / STEP_HZ, delayedLength);
  }
  if (delayedLength) {
    return delayedLength;
  }
  if (!state.roots.length) {
    return 0;
  }

  const def =
    scene.root?.kind === 'system'
      ? library.systems.get(scene.root.name.toLowerCase())
      : undefined;
  const frames =
    def && def.systemLifetime > 0
      ? def.systemLifetime + Math.max(def.lifetime.low, def.lifetime.high)
      : OPEN_ENDED_FRAMES;

  return getTimelineSeconds() ?? Math.max(frames, MIN_EFFECT_FRAMES) / STEP_HZ;
};

const flash = $('flash');

let effects = getEffectStateAt([], 0, STEP_HZ);

const prepareFrame = () => {
  effects = objectView.scene
    ? getEffectStateAt([], 0, STEP_HZ)
    : getEffectStateAt(listEffects(), world.frame, STEP_HZ);

  if (effects.flash) {
    const [red, green, blue] = effects.flash.color.map((channel) =>
      Math.round(channel * 255),
    );

    flash.style.background = `rgba(${red}, ${green}, ${blue}, ${effects.flash.alpha})`;
  } else {
    flash.style.background = 'transparent';
  }
  return {
    shake: (effects.shake * Math.PI) / 180,
    modelOffset: getModelOrigin(),
  };
};

const draw = ({ matrix, basis }: ViewerCamera) => {
  const between = viewer.getTime() * STEP_HZ - world.frame;

  drawSystems(
    matrix,
    basis,
    viewer.isPlaying() ? Math.max(0, Math.min(1, between)) : 1,
  );
  if (effects.scorches.length) {
    const lines: number[] = [];
    const [x, y, z] = getRootOrigin();

    for (const radius of effects.scorches) {
      pushRing(lines, [x, y, z], radius, [0.85, 0.5, 0.2, 1]);
    }
    viewer.drawLines(lines, matrix, false);
  }
  if (isChecked('showVolume')) {
    const lines: number[] = [];

    for (const system of world.systems) {
      const def = library.systems.get(system.name.toLowerCase());

      if (def && state.roots.includes(system.id)) {
        pushVolumeLines(lines, def, system.origin);
      }
    }
    viewer.drawLines(lines, matrix, false);
  }
  drawHandles();
};

let lastStatus = 0;

const onFrame = (now: number) => {
  drawTimeline();
  showStats(now);
  const status = [
    ...(hasGraphics ? [] : ['WebGL is not available; nothing is drawn.']),
    `${world.systems.length} systems · ${world.liveParticles} particles` +
      (world.dropped ? ` · dropped ${world.dropped}` : ''),
    ...(state.scene?.comparing ? ['showing the block as written (C)'] : []),
  ].join('\n');

  if (status !== hud.textContent) {
    hud.textContent = status;
  }
  if (now - lastStatus > 1000) {
    lastStatus = now;
    post({
      kind: 'status',
      frame: world.frame,
      systems: world.systems.length,
      particles: world.liveParticles,
    });
  }
};

attachHandles();
attachMove();
$('apply').onclick = () => post({ kind: 'apply' });
const compare = () => post({ kind: 'compare', on: !state.scene?.comparing });
$('compare').onclick = compare;
$('variant').onclick = () => post({ kind: 'variant' });
$('vary').onclick = () => {
  const scene = state.scene;
  const amount = Number($<HTMLInputElement>('varyAmount').value) / 100;

  if (!scene || !(amount > 0)) {
    return;
  }
  post({
    kind: 'setMany',
    values: Object.fromEntries(
      scene.fields
        .filter((field) => field.part !== 'frame')
        .map((field) => {
          const current = scene.values[field.id] ?? field.value;
          const next = current * (1 + (Math.random() * 2 - 1) * amount);

          return [
            field.id,
            field.integer ? Math.round(next) : Number(next.toFixed(4)),
          ];
        }),
    ),
  });
};
$('scale').onclick = () => {
  const scene = state.scene;

  if (!scene) {
    return;
  }
  try {
    post({
      kind: 'setMany',
      values: Object.fromEntries(
        scaleEffect(
          scene.fields,
          new Map(Object.entries(scene.values)),
          Number($<HTMLInputElement>('scaleSpace').value),
          Number($<HTMLInputElement>('scaleTime').value),
        ),
      ),
    });
  } catch (error) {
    $('notice').textContent = (error as Error).message;
  }
};
$('reset').onclick = () => post({ kind: 'reset' });

const onKey = (key: string): boolean => {
  if (key === 'c') {
    compare();
    return true;
  }
  return false;
};

const bones = $<HTMLSelectElement>('bone');
let pose: Pose | undefined;

bones.onchange = () => {
  const bone = Number(bones.value);

  const at = bones.value === '' ? undefined : pose?.world[bone];

  attachment.bone = at ? [...at.t] : [0, 0, 0];
  viewer.orbit.setTarget([...attachment.bone]);
  viewer.restart();
};
$('pickModel').onclick = () => post({ kind: 'pickModel' });

const showModel = (shown: { name: string; scene: ModelScene } | undefined) => {
  const skeleton = shown?.scene.skeleton;

  viewer.setModel(shown?.scene, !objectView.scene);
  pose = skeleton && poseAt(skeleton);
  bones.replaceChildren(
    new Option('origin', ''),
    ...(skeleton?.names ?? []).map(
      (bone, at) => new Option(bone, String(at)),
    ),
  );
  bones.hidden = !shown || !!objectView.scene;
  attachment.bone = [0, 0, 0];
  $('pickModel').textContent = shown ? shown.name : 'On a model…';
  if (objectView.scene) {
    refreshShownModel();
    return;
  }
  viewer.restart();
};

onMainModel(showModel);

window.addEventListener('message', ({ data }: MessageEvent<ToPage>) => {
  if (data.kind === 'sound') {
    void pageSoundPlayer.receive(data);
    return;
  }
  if (data.kind === 'notice') {
    $('notice').textContent = data.message;
    return;
  }
  if (data.kind === 'object') {
    setGroundColour(data.groundColour);
    showObject(data.object, data.focus, data.definition);
    return;
  }
  if (data.kind === 'decal') {
    receiveDecal(data.name, data.url);
    return;
  }
  if (data.kind === 'composition') {
    showComposition(data.composition);
    planPreload();
    return;
  }
  if (data.kind === 'partModel') {
    const { name, textures, detail, scene, error } = data;

    receiveModel({ name, textures, detail }, scene, error);
    return;
  }
  if (data.kind === 'partAnimation') {
    receiveClip(data.name, data.animation, data.skeleton);
    return;
  }
  if (data.kind === 'preloadPlan') {
    receivePreloadPlan(data.plan);
    return;
  }
  if (data.kind === 'abilities') {
    for (const [name, system] of Object.entries(data.systems)) {
      library.systems.set(name, system);
    }
    for (const [name, list] of Object.entries(data.fxLists)) {
      library.fxLists.set(name, list);
    }
    loadTextures(data.textures);
    showAbilities(data.groups);
    return;
  }
  if (data.kind === 'partEffects') {
    for (const [name, system] of Object.entries(data.systems)) {
      library.systems.set(name, system);
    }
    for (const [name, list] of Object.entries(data.fxLists)) {
      library.fxLists.set(name, list);
    }
    loadTextures(data.textures);
    viewer.restart();
    return;
  }
  if (data.kind === 'forgetModels') {
    forgetLoaded();
    forgetDecals();
    planPreload();
    return;
  }
  if (data.kind === 'forgetTextures') {
    forgetTextures();
    return;
  }
  if (data.kind === 'animation') {
    receiveAnimation(data.name, data.animation, data.skeleton);
    return;
  }
  if (data.kind === 'model') {
    showModel(data.model);
    return;
  }

  const first = !state.scene;

  state.scene = data;
  library.systems = new Map(Object.entries(data.systems));
  library.fxLists = new Map(Object.entries(data.fxLists));
  loadTextures(data.textures);
  if (data.root) {
    $('title').textContent =
      (data.root.kind === 'fxList' ? 'FX list ' : '') + data.root.name;
  }
  $('notice').textContent = '';
  $('notes').replaceChildren(
    ...data.notes.map((note) => {
      const line = document.createElement('div');

      line.textContent = '• ' + note;
      return line;
    }),
  );
  renderFields(data);
  $('compare').classList.toggle('on', data.comparing);
  $('compare').textContent = data.comparing
    ? 'A/B: as written (C)'
    : 'A/B: with changes (C)';
  renderCurves();
  renderTimeline(viewer.restart);
  if (first && !viewer.getModel()) {
    const def = data.root && library.systems.get(data.root.name.toLowerCase());
    const reach = def ? estimateReach(def) : 0;

    viewer.orbit.frame(
      [0, 0, def ? Math.min(80, reach / 3) : 20],
      (def ? reach * REACH_DISTANCE : DEFAULT_DISTANCE) / DISTANCE_RADII,
    );
  }
  if (data.restart || first) {
    viewer.restart();
  }
});

viewer.addLayer({
  getLength: getEffectSeconds,
  isBusy: () =>
    isAbilityPlaying() ||
    (!!state.scene && state.roots.length > 0 && viewer.getTime() - lastBusyTime <= LOOP_PAUSE),
  onAdvance: (time) => {
    if (state.scene) {
      stepTo(time, MAX_FRAME_STEPS);
    }
    advanceAbility(time, world.systems.some(({ id }) => abilitySystems.has(id)));
  },
  onSeek: (time) => {
    if (time * STEP_HZ < world.frame) {
      startEffects();
    }
    stepTo(time, MAX_SEEK_STEPS);
    skipDueSounds();
    syncAbilityClip(time);
  },
  onRestart: () => {
    startEffects();
    syncAbilityClip(0);
  },
  onFrame,
  prepareFrame,
  draw,
  onKey,
});
post({ kind: 'ready' });
