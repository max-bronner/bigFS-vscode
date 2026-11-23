import type { Vec3 } from '../../formats/w3d/w3dPose';
import { STEP_HZ } from '../../formats/particles/particleSimulation';
import { findBodyDraw, pickPlayingClip, pickPlayingState } from '../../game/objects/drawStates';
import type { AbilityPlace, ObjectAbility } from '../../game/objects/objectAbilities';
import { readStateConditions } from '../../game/objects/objectScene';
import type { SceneState } from '../../game/objects/objectScene';
import { getClipSeconds } from '../shared/viewer/clipTiming';
import type { Effect } from './effectsPanel';
import { findClip, loadClip, onStoreChanged } from './modelStore';
import type { LoadedClip } from './modelStore';
import { listShownConditions, objectView, onPanelClip, replayShownClip } from './objectPanel';
import { library, viewer } from './page';

export type AbilityPlayedEffect = Effect & {
  until?: number;
};

const OFFSETS: Record<AbilityPlace, Vec3 | undefined> = {
  self: undefined,
  target: [100, 0, 0],
  flight: [50, 0, 20],
};
const OPEN_ENDED_FRAMES = STEP_HZ * 4;
const MAX_SECONDS = 30;
const MAX_SYSTEM_DEPTH = 3;

interface PlayedPhase {
  start: number;
  end: number;
  state?: SceneState;
  clip?: string;
  phases: number[];
}

interface Playback {
  key: string;
  ability: ObjectAbility;
  phases: PlayedPhase[];
  effects: AbilityPlayedEffect[];
  settled: number;
  end: number;
  waiting: Set<string>;
  shown?: string;
  onEnd: () => void;
}

let playback: Playback | undefined;

const isSameName = (a: string | undefined, b: string | undefined) => a?.toLowerCase() === b?.toLowerCase();

const estimateSystemFrames = (name: string, depth = 0): number => {
  const def = library.systems.get(name.toLowerCase());

  if (!def || depth > MAX_SYSTEM_DEPTH) {
    return 0;
  }

  const own =
    def.initialDelay.high + (def.systemLifetime > 0 ? def.systemLifetime : OPEN_ENDED_FRAMES) + Math.max(def.lifetime.low, def.lifetime.high);
  const children = [def.perParticleSystem, def.slaveSystem].map((child) => (child ? estimateSystemFrames(child, depth + 1) : 0));

  return own + Math.max(0, ...children);
};

const estimateEffectSeconds = ({ kind, name }: Effect): number => {
  if (kind === 'system') {
    return estimateSystemFrames(name) / STEP_HZ;
  }

  const list = library.fxLists.get(name.toLowerCase());

  return Math.max(
    0,
    ...(list?.nuggets ?? []).map(
      (nugget) => nugget.initialDelay.high / 1000 + estimateSystemFrames(nugget.system) / STEP_HZ,
    ),
  );
};

const listOwnEffects = (ability: ObjectAbility, replaced: ReadonlySet<number>): AbilityPlayedEffect[] =>
  ability.effects
    .filter((effect) => effect.phase === undefined || !replaced.has(effect.phase))
    .flatMap(({ kind, name, place, bone, delay = 0, repeat }) => {
      const offset = OFFSETS[place];

      return Array.from({ length: 1 + (repeat?.count ?? 0) }, (_, at): AbilityPlayedEffect => {
        const time = delay + at * (repeat?.every ?? 0);

        return { kind, name, ...(bone ? { bone } : {}), ...(offset ? { offset } : {}), ...(time ? { delay: time } : {}) };
      });
    });

const listPhaseEffects = ({ state, start, end, clip }: PlayedPhase): AbilityPlayedEffect[] => {
  if (!state) {
    return [];
  }

  const animation = clip ? findClip(clip)?.animation : undefined;
  const rate = animation?.frameRate || STEP_HZ;
  const pass = animation && !state.playsOnce ? getClipSeconds(animation) : Infinity;
  const at = (time: number) => (time > 0 ? { delay: time } : {});

  return [
    ...state.particles.map(
      ({ bone, system }): AbilityPlayedEffect => ({
        kind: 'system',
        name: system,
        ...(/^none$/i.test(bone) ? {} : { bone }),
        ...at(start),
        until: end,
      }),
    ),
    ...state.fx.map((name): AbilityPlayedEffect => ({ kind: 'fxList', name, ...at(start) })),
    ...(state.fxEvents ?? []).flatMap(({ name, frame }) => {
      const times: number[] = [];

      for (let time = start + frame / rate; time < end && times.length < 64; time += pass) {
        times.push(time);
      }
      return times.map((time): AbilityPlayedEffect => ({ kind: 'fxList', name, ...at(time) }));
    }),
  ];
};

const pickPhases = (ability: ObjectAbility): PlayedPhase[] => {
  const scene = objectView.scene;
  const draw = objectView.state?.draw ?? (scene && findBodyDraw(scene));

  if (!scene || !draw) {
    return [];
  }

  const held = listShownConditions(scene);
  const played: PlayedPhase[] = [];

  ability.phases.forEach(({ conditions, start, length }, at) => {
    const all = [...new Set([...held, ...conditions])];
    const picked = pickPlayingState(scene, draw, all);
    const state = picked && readStateConditions(picked).some((condition) => conditions.includes(condition)) ? picked : undefined;
    const clip = state ? pickPlayingClip(scene, draw, all) : objectView.clip;
    const end = length === undefined ? NaN : start + length;
    const previous = played[played.length - 1];

    if (previous && previous.state === state && isSameName(previous.clip, clip)) {
      previous.end = end;
      previous.phases.push(at);
    } else {
      played.push({ start, end, ...(state ? { state } : {}), ...(clip ? { clip } : {}), phases: [at] });
    }
  });
  return played;
};

const prepare = (current: Playback) => {
  current.phases.forEach((phase) => {
    if (Number.isNaN(phase.end)) {
      const animation = phase.clip ? findClip(phase.clip)?.animation : undefined;

      phase.end = phase.start + (animation ? getClipSeconds(animation) : 0);
    }
  });

  const replaced = new Set(current.phases.filter((phase) => phase.state).flatMap((phase) => phase.phases));

  current.effects = [...listOwnEffects(current.ability, replaced), ...current.phases.flatMap(listPhaseEffects)];
  current.settled = Math.max(
    0,
    ...current.phases.map((phase) => phase.end),
    ...current.effects.map((effect) => effect.delay ?? 0),
  );
  current.end = Math.min(
    MAX_SECONDS,
    Math.max(
      0,
      ...current.phases.map((phase) => phase.end),
      ...current.effects.map((effect) => (effect.until ?? effect.delay ?? 0) + estimateEffectSeconds(effect)),
    ),
  );
};

const findClipAt = (current: Playback, time: number) => {
  const phase = current.phases.find((each) => each.clip && time >= each.start && time < each.end);
  const last = current.phases[current.phases.length - 1];

  if (phase) {
    return { name: phase.clip!, startsAt: phase.start, playsOnce: !!phase.state?.playsOnce };
  }
  const startsAt = last && time >= last.end ? last.end : 0;

  return objectView.clip ? { name: objectView.clip, startsAt, playsOnce: false } : undefined;
};

export const syncAbilityClip = (time: number): void => {
  const current = playback;

  if (!current || current.waiting.size) {
    return;
  }

  const wanted = findClipAt(current, time);
  const key = wanted && `${wanted.name}@${wanted.startsAt}`;
  const loaded: LoadedClip | null | undefined = wanted && findClip(wanted.name);

  if (key === current.shown || !wanted || !loaded) {
    return;
  }
  current.shown = key;
  viewer.switchClip({ id: wanted.name, ...loaded, startsAt: wanted.startsAt, playsOnce: wanted.playsOnce });
};

const start = (current: Playback) => {
  prepare(current);

  const wanted = findClipAt(current, 0);
  const loaded = wanted && findClip(wanted.name);

  if (wanted && loaded) {
    current.shown = `${wanted.name}@${wanted.startsAt}`;
    viewer.playClip({ id: wanted.name, ...loaded, startsAt: 0, playsOnce: wanted.playsOnce });
    viewer.showClipChoice(objectView.clip);
  } else {
    viewer.restart();
  }
};

export const stopAbility = (restores = true): void => {
  const current = playback;

  if (!current) {
    return;
  }
  playback = undefined;
  current.onEnd();
  if (restores) {
    replayShownClip();
  }
};

export const playAbility = (ability: ObjectAbility, key: string, onEnd: () => void): void => {
  stopAbility(false);

  const phases = pickPhases(ability);
  const clips = [...new Set(phases.flatMap((phase) => phase.clip ?? []))];
  const current: Playback = {
    key,
    ability,
    phases,
    effects: [],
    settled: 0,
    end: 0,
    waiting: new Set(clips.filter((clip) => findClip(clip) === undefined).map((clip) => clip.toLowerCase())),
    onEnd,
  };

  playback = current;
  current.waiting.forEach(loadClip);
  if (!current.waiting.size) {
    start(current);
  }
};

export const isAbilityPlaying = (key?: string): boolean => !!playback && (key === undefined || playback.key === key);

export const listAbilityEffects = (): AbilityPlayedEffect[] =>
  playback && !playback.waiting.size ? playback.effects : [];

export const getAbilitySeconds = (): number => (playback && !playback.waiting.size ? playback.end : 0);

export const advanceAbility = (time: number, isRunning: boolean): void => {
  if (playback && !playback.waiting.size && (time >= playback.end || (time >= playback.settled && !isRunning))) {
    stopAbility();
    return;
  }
  syncAbilityClip(time);
};

onStoreChanged(() => {
  const current = playback;

  if (!current?.waiting.size) {
    return;
  }
  for (const clip of [...current.waiting]) {
    if (findClip(clip) !== undefined) {
      current.waiting.delete(clip);
    }
  }
  if (!current.waiting.size) {
    start(current);
  }
});

onPanelClip(() => stopAbility(false));
