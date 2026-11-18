import type {
  FxListDef,
  NumericField,
} from '../../formats/particles/particleIni';
import type { FxEffect } from '../../formats/particles/fxEffects';
import { effectLength } from '../../formats/particles/fxEffects';
import { STEP_HZ } from '../../formats/particles/particleSimulation';
import { $, library, post, state, world } from './page';

const container = $('timeline');
const ROW = 20;
const LABEL = 96;
const PAD = 6;

const muted = new Set<number>();
let solo: number | undefined;
let original: FxListDef | undefined;
let canvas: HTMLCanvasElement | undefined;
let drag:
  | { nugget: number; startX: number; delays: [string, number][] }
  | undefined;

const rootList = () =>
  state.scene?.root?.kind === 'fxList'
    ? state.scene.fxLists[state.scene.root.name.toLowerCase()]
    : undefined;

const delayFrames = (ms: number) => Math.ceil((ms * STEP_HZ) / 1000);

const duration = (system: string): number | undefined => {
  const def = library.systems.get(system.toLowerCase());

  if (!def) {
    return undefined;
  }
  return def.systemLifetime > 0
    ? def.systemLifetime + Math.max(def.lifetime.low, def.lifetime.high)
    : Number.POSITIVE_INFINITY;
};

const delayFields = (module: number): NumericField[] =>
  (state.scene?.fields ?? []).filter(
    (field) =>
      field.moduleIndex === module &&
      field.keyword.toLowerCase() === 'initialdelay',
  );

const playedList = (list: FxListDef): FxListDef => ({
  ...list,
  nuggets: list.nuggets.filter((_, index) =>
    solo !== undefined ? index === solo : !muted.has(index),
  ),
});

export const applyMuting = (): void => {
  const list = rootList();

  original = list;
  if (list) {
    library.fxLists.set(list.name.toLowerCase(), playedList(list));
  }
};

const span = (list: FxListDef): number => {
  const ends = list.nuggets.map((nugget) => {
    const end = duration(nugget.system);

    return delayFrames(nugget.initialDelay.high) + (end ?? 0);
  });
  const finite = [
    ...ends.filter(Number.isFinite),
    ...list.effects.map(
      (effect) =>
        delayFrames(effect.initialDelay.low) +
        (effectLength(effect) / 1000) * STEP_HZ,
    ),
  ];

  return Math.max(
    STEP_HZ * 2,
    world.frame + STEP_HZ / 2,
    ...finite,
    ...(finite.length < ends.length ? [STEP_HZ * 4] : []),
  );
};

export const listEffects = (): readonly FxEffect[] => original?.effects ?? [];

export const drawTimeline = (): void => {
  const list = original;

  if (!list || !canvas) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const rows = list.nuggets.length + list.sounds.length + list.effects.length;
  const height = PAD * 2 + Math.max(1, rows) * ROW + 12;

  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;
  }

  const ctx = canvas.getContext('2d')!;
  const frames = span(list);
  const x = (frame: number) =>
    LABEL + (Math.min(frame, frames) / frames) * (width - LABEL - PAD);

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(24, 24, 24, 0.9)';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '11px sans-serif';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let second = 0; second * STEP_HZ <= frames; second++) {
    const at = x(second * STEP_HZ);

    ctx.fillRect(at, PAD, 1, rows * ROW);
    ctx.fillText(`${second}s`, at + 2, height - 8);
  }

  const alive = new Map<string, number>();

  for (const system of world.systems) {
    const key = system.name.toLowerCase();

    alive.set(key, (alive.get(key) ?? 0) + system.particles.length);
  }

  list.nuggets.forEach((nugget, index) => {
    const top = PAD + index * ROW;
    const off = solo !== undefined ? index !== solo : muted.has(index);
    const start = delayFrames(nugget.initialDelay.low);
    const late = delayFrames(nugget.initialDelay.high);
    const length = duration(nugget.system);
    const live = alive.get(nugget.system.toLowerCase()) ?? 0;

    ctx.fillStyle = off ? 'rgba(255,255,255,0.35)' : '#ddd';
    ctx.fillText(
      (nugget.count > 1 ? `${nugget.count}× ` : '') + nugget.system,
      4,
      top + ROW / 2,
      LABEL - 8,
    );
    if (length === undefined) {
      ctx.fillStyle = '#f66';
      ctx.fillText('not found', x(start) + 2, top + ROW / 2);
      return;
    }
    ctx.fillStyle = off
      ? 'rgba(120,120,120,0.4)'
      : live
        ? 'rgba(255, 204, 51, 0.9)'
        : 'rgba(255, 204, 51, 0.45)';
    ctx.fillRect(x(start), top + 4, x(late + length) - x(start), ROW - 8);
    if (late > start) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x(start), top + 4, x(late) - x(start), ROW - 8);
    }
    if (!Number.isFinite(length)) {
      ctx.fillStyle = '#000';
      ctx.fillText('→', width - PAD - 12, top + ROW / 2);
    }
  });
  list.sounds.forEach((sound, index) => {
    const top = PAD + (list.nuggets.length + index) * ROW;
    const at = x(delayFrames(sound.initialDelay.low));

    ctx.fillStyle = '#8f8';
    ctx.fillText('▶', 4, top + ROW / 2);
    ctx.fillStyle = '#ddd';
    ctx.fillText(
      sound.name,
      4 + PLAY_ZONE,
      top + ROW / 2,
      LABEL - 8 - PLAY_ZONE,
    );
    ctx.fillStyle = 'rgba(136, 255, 136, 0.9)';
    ctx.fillRect(at, top + 4, 2, ROW - 8);
  });
  list.effects.forEach((effect, index) => {
    const top = PAD + (list.nuggets.length + list.sounds.length + index) * ROW;
    const approximated = !!effect.approximation;
    const at = x(delayFrames(effect.initialDelay.low));
    const length = (effectLength(effect) / 1000) * STEP_HZ;

    ctx.fillStyle = approximated ? '#ddd' : 'rgba(255,255,255,0.35)';
    ctx.fillText(
      approximated ? effect.slot : `${effect.slot} (not previewed)`,
      4,
      top + ROW / 2,
      LABEL - 8,
    );
    ctx.fillStyle = approximated
      ? 'rgba(102, 187, 255, 0.7)'
      : 'rgba(255,255,255,0.35)';
    ctx.fillRect(
      at,
      top + 4,
      length ? x(delayFrames(effect.initialDelay.low) + length) - at : 2,
      ROW - 8,
    );
    if (effect.detail) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(effect.detail, at + 6, top + ROW / 2, width - at - PAD - 6);
    }
  });

  playDueSounds(list);

  const head = x(world.frame);

  ctx.fillStyle = '#4af';
  ctx.fillRect(head, PAD - 2, 2, rows * ROW + 4);
};

const rowAt = (y: number) => {
  const index = Math.floor((y - PAD) / ROW);

  return original && index >= 0 && index < original.nuggets.length
    ? index
    : undefined;
};

const soundAt = (y: number) => {
  const index =
    Math.floor((y - PAD) / ROW) - (original ? original.nuggets.length : 0);

  return original && index >= 0 && index < original.sounds.length
    ? index
    : undefined;
};

let clearButton: HTMLButtonElement | undefined;
let soundsBox: HTMLInputElement | undefined;
let soundFrame = 0;

const PLAY_ZONE = 18;

const playDueSounds = (list: FxListDef): void => {
  if (!soundsBox?.checked) {
    soundFrame = world.frame;
    return;
  }
  if (world.frame < soundFrame) {
    soundFrame = -1;
  }
  for (const sound of list.sounds) {
    const due = delayFrames(sound.initialDelay.low);

    if (due > soundFrame && due <= world.frame) {
      post({ kind: 'playSound', name: sound.name });
    }
  }
  soundFrame = world.frame;
};

export const renderTimeline = (restart: () => void): void => {
  const list = rootList();

  if (!list) {
    container.replaceChildren();
    canvas = undefined;
    return;
  }
  applyMuting();
  if (canvas && clearButton) {
    clearButton.disabled = !muted.size && solo === undefined;
    return;
  }

  const view = document.createElement('canvas');
  const heading = document.createElement('div');
  const clear = document.createElement('button');
  const replay = () => {
    applyMuting();
    restart();
    clear.disabled = !muted.size && solo === undefined;
  };

  view.className = 'curve';
  view.style.width = '100%';
  view.title =
    'Click a name to mute it, click ▶ on a sound row to hear it, shift-click to play it alone; drag a bar to move its InitialDelay';
  heading.className = 'curve-heading';
  heading.textContent = 'Timeline ';
  clear.textContent = 'Play all';
  clear.onclick = () => {
    muted.clear();
    solo = undefined;
    replay();
  };
  heading.append(clear);

  const soundsLabel = document.createElement('label');
  const sounds = document.createElement('input');

  sounds.type = 'checkbox';
  sounds.checked = false;
  soundsLabel.title =
    'Play each Sound nugget at its delay while the effect runs; off by default';
  soundsLabel.append(sounds, ' Play sounds');
  soundsBox = sounds;
  heading.append(' ', soundsLabel);

  view.addEventListener('pointerdown', (event) => {
    const box = view.getBoundingClientRect();
    const sound = soundAt(event.clientY - box.top);

    if (sound !== undefined) {
      if (event.clientX - box.left < LABEL) {
        post({ kind: 'playSound', name: original!.sounds[sound].name });
      }
      return;
    }

    const index = rowAt(event.clientY - box.top);

    if (index === undefined) {
      return;
    }
    if (event.clientX - box.left < LABEL) {
      if (event.shiftKey) {
        solo = solo === index ? undefined : index;
      } else if (!muted.delete(index)) {
        muted.add(index);
      }
      replay();
      return;
    }

    const delays = delayFields(original!.nuggets[index].module);

    if (!delays.length) {
      return;
    }
    view.setPointerCapture(event.pointerId);
    drag = {
      nugget: index,
      startX: event.clientX,
      delays: delays.map((field) => [
        field.id,
        state.scene?.values[field.id] ?? field.value,
      ]),
    };
  });
  view.addEventListener('pointermove', (event) => {
    if (!drag || !original) {
      return;
    }

    const width = view.clientWidth - LABEL - PAD;
    const ms =
      ((event.clientX - drag.startX) / width) *
      (span(original) / STEP_HZ) *
      1000;

    for (const [id, value] of drag.delays) {
      const next = Math.max(0, Math.round((value + ms) / 10) * 10);

      if (state.scene) {
        state.scene.values[id] = next;
      }
      post({ kind: 'set', id, value: next });
    }
  });
  view.addEventListener('pointerup', () => (drag = undefined));
  canvas = view;
  clearButton = clear;
  clear.disabled = !muted.size && solo === undefined;
  container.replaceChildren(heading, view);
};
