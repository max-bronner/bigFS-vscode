import { EASINGS, compileExpression } from '../../core/expression';
import { AptReader } from './aptMovie';
import type { Frame, Matrix2 } from './aptMovie';

export interface Slot {
  token: string;
  character: number;
  matrix: Matrix2;
  translate: [number, number];
  colorTransform?: number;
  colorAdd?: number;
  ratio?: number;
  name?: string;
  clipDepth?: number;
  clipActions?: number;
}

export interface FrameState {
  display: Map<number, Slot>;
  kept: number[];
  labels: Label[];
  source?: number;
}

export interface Label {
  label: string;
  flags: number;
}

export type FrameSpec =
  | { reuse: number }
  | {
      items: (
        { reuse: number } | { remove: number } | Label | { place: PlaceSpec }
      )[];
    };

export interface PlaceSpec {
  move: boolean;
  depth: number;
  character?: number;
  matrix?: Matrix2;
  translate?: [number, number];
  colorTransform?: number;
  colorAdd?: number;
  ratio?: number;
  name?: string;
  clipDepth?: number;
  clipActions?: number;
}

export const decodeTimeline = (
  apt: Uint8Array | undefined,
  frames: Frame[],
): FrameState[] => {
  const reader = apt && new AptReader(apt);
  const display = new Map<number, Slot>();

  return frames.map((frame, index) => {
    const kept: number[] = [];
    const labels: Label[] = [];

    for (const item of frame.items) {
      if (item.type === 'removeObject') {
        display.delete(item.depth);
      } else if (item.type === 'placeObject') {
        const existing = display.get(item.depth);
        const isNew =
          !(item.flags & 1) ||
          !existing ||
          (item.character !== undefined &&
            item.character !== existing.character);
        const slot: Slot = isNew
          ? {
              token: `${index}@${item.depth}`,
              character: item.character ?? existing?.character ?? 0,
              matrix: [1, 0, 0, 1],
              translate: [0, 0],
              clipActions:
                item.flags & 0x80
                  ? reader?.u32(item.offset + 60) || undefined
                  : undefined,
            }
          : { ...existing };

        if (item.matrix) {
          slot.matrix = item.matrix;
          slot.translate = item.translate ?? [0, 0];
        }
        if (item.colorTransform !== undefined) {
          slot.colorTransform = item.colorTransform;
          slot.colorAdd = item.colorAdd;
        }
        if (item.ratio !== undefined) {
          slot.ratio = item.ratio;
        }
        if (item.name !== undefined) {
          slot.name = item.name;
        }
        if (item.clipDepth !== undefined) {
          slot.clipDepth = item.clipDepth;
        }
        display.set(item.depth, slot);
      } else if (item.type === 'frameLabel') {
        labels.push({ label: item.label, flags: item.flags });
      } else {
        kept.push(item.offset);
      }
    }

    return {
      display: new Map(
        [...display].map(([depth, slot]) => [depth, { ...slot }]),
      ),
      kept,
      labels,
      source: index,
    };
  });
};

const SLOT_KEYS: (keyof Slot)[] = [
  'token',
  'character',
  'matrix',
  'translate',
  'colorTransform',
  'colorAdd',
  'ratio',
  'name',
  'clipDepth',
  'clipActions',
];

const sameSlot = (a: Slot | undefined, b: Slot | undefined): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    SLOT_KEYS.every(
      (key) => JSON.stringify(a[key]) === JSON.stringify(b[key]),
    ));

const sameDisplay = (
  a: Map<number, Slot> | undefined,
  b: Map<number, Slot> | undefined,
) =>
  (a?.size ?? 0) === (b?.size ?? 0) &&
  [...(a ?? new Map<number, Slot>())].every(([depth, slot]) =>
    sameSlot(slot, b?.get(depth)),
  );

export const encodeTimeline = (
  original: FrameState[],
  next: FrameState[],
): FrameSpec[] =>
  next.map((state, index) => {
    const source = state.source;
    const before = original[source ?? -1];

    if (
      source !== undefined &&
      before &&
      (index === source || !state.labels.length) &&
      sameDisplay(state.display, before.display) &&
      sameDisplay(next[index - 1]?.display, original[source - 1]?.display) &&
      JSON.stringify([state.kept, state.labels]) ===
        JSON.stringify([before.kept, before.labels])
    ) {
      return { reuse: source };
    }

    const previous = next[index - 1]?.display ?? new Map<number, Slot>();
    const items: Extract<FrameSpec, { items: unknown }>['items'] = [];

    for (const depth of previous.keys()) {
      const now = state.display.get(depth);

      if (!now || now.token !== previous.get(depth)!.token) {
        items.push({ remove: depth });
      }
    }
    for (const [depth, slot] of [...state.display].sort(
      (a, b) => a[0] - b[0],
    )) {
      const was = previous.get(depth);

      if (!was || was.token !== slot.token) {
        items.push({
          place: {
            move: false,
            depth,
            character: slot.character,
            matrix: slot.matrix,
            translate: slot.translate,
            colorTransform: slot.colorTransform,
            colorAdd: slot.colorAdd,
            ratio: slot.ratio,
            name: slot.name,
            clipDepth: slot.clipDepth,
            clipActions: slot.clipActions,
          },
        });
      } else if (!sameSlot(was, slot)) {
        const moved =
          was.matrix.some((value, at) => value !== slot.matrix[at]) ||
          was.translate.some((value, at) => value !== slot.translate[at]);
        const coloured =
          was.colorTransform !== slot.colorTransform ||
          was.colorAdd !== slot.colorAdd;

        items.push({
          place: {
            move: true,
            depth,
            ...(moved
              ? { matrix: slot.matrix, translate: slot.translate }
              : {}),
            ...(coloured
              ? {
                  colorTransform: slot.colorTransform ?? 0xffffffff,
                  colorAdd: slot.colorAdd ?? 0,
                }
              : {}),
            ...(was.ratio !== slot.ratio ? { ratio: slot.ratio ?? 0 } : {}),
            ...(was.name !== slot.name && slot.name ? { name: slot.name } : {}),
          },
        });
      }
    }
    items.push(...state.labels, ...state.kept.map((reuse) => ({ reuse })));
    return { items };
  });

const cloneStates = (states: FrameState[]): FrameState[] =>
  states.map((state) => ({
    ...state,
    display: new Map(
      [...state.display].map(([depth, slot]) => [
        depth,
        {
          ...slot,
          matrix: [...slot.matrix] as Matrix2,
          translate: [...slot.translate] as [number, number],
        },
      ]),
    ),
    kept: [...state.kept],
    labels: state.labels.map((label) => ({ ...label })),
  }));

const checkRange = (states: FrameState[], from: number, to: number) => {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to >= states.length ||
    from > to
  ) {
    throw new Error(
      `Frames ${from} to ${to} are not in the timeline's ${states.length}`,
    );
  }
};

export interface Pose {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skew: number;
  alpha: number;
}

export const poseOf = (slot: Slot): Pose => {
  const [a, b, c, d] = slot.matrix;
  const scaleX = Math.hypot(a, b);
  const rotation = Math.atan2(b, a);
  const scaleY = scaleX ? (a * d - b * c) / scaleX : Math.hypot(c, d);

  return {
    x: slot.translate[0],
    y: slot.translate[1],
    scaleX,
    scaleY,
    rotation: (rotation * 180) / Math.PI,
    skew: scaleX ? (a * c + b * d) / (scaleX * scaleX) : 0,
    alpha:
      slot.colorTransform === undefined
        ? 1
        : (slot.colorTransform >>> 24) / 255,
  };
};

export const withPose = (slot: Slot, pose: Pose): Slot => {
  const radians = (pose.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const alpha = Math.round(Math.min(1, Math.max(0, pose.alpha)) * 255);
  const round = (value: number) => Math.round(value * 1e4) / 1e4;

  return {
    ...slot,
    matrix: [
      round(pose.scaleX * cos),
      round(pose.scaleX * sin),
      round(pose.scaleX * pose.skew * cos - pose.scaleY * sin),
      round(pose.scaleX * pose.skew * sin + pose.scaleY * cos),
    ],
    translate: [round(pose.x), round(pose.y)],
    colorTransform:
      alpha === 255 &&
      (slot.colorTransform === undefined ||
        (slot.colorTransform & 0xffffff) === 0xffffff)
        ? slot.colorTransform === undefined
          ? undefined
          : ((slot.colorTransform & 0xffffff) | (255 << 24)) >>> 0
        : (((slot.colorTransform ?? 0xffffffff) & 0xffffff) | (alpha << 24)) >>>
          0,
  };
};

export type PoseFormulas = Partial<Record<keyof Pose, string>>;

export const animate = (
  states: FrameState[],
  depth: number,
  from: number,
  to: number,
  formulas: PoseFormulas,
  easing = 'linear',
): FrameState[] => {
  checkRange(states, from, to);

  const start = states[from].display.get(depth);
  const ease = EASINGS[easing];

  if (!start) {
    throw new Error(`Nothing is placed at depth ${depth} in frame ${from}`);
  }
  if (!ease) {
    throw new Error(`There is no easing called ${easing}`);
  }

  const compiled = Object.entries(formulas)
    .filter(([, formula]) => formula !== undefined && formula.trim() !== '')
    .map(([key, formula]) => [key, compileExpression(formula!)] as const);
  const base = poseOf(start);
  const startVariables = Object.fromEntries(
    Object.entries(base).map(([key, value]) => [`${key}0`, value]),
  );
  const next = cloneStates(states);
  const count = to - from + 1;

  for (let frame = from; frame <= to; frame++) {
    const i = frame - from;
    const variables = {
      ...startVariables,
      t: ease(count > 1 ? i / (count - 1) : 1),
      f: frame,
      i,
      n: count,
    };
    const here = states[frame].display.get(depth);
    const pose =
      here && here.token === start.token ? poseOf(here) : { ...base };

    for (const [key, formula] of compiled) {
      pose[key as keyof Pose] = formula(variables);
    }
    next[frame].display.set(
      depth,
      withPose({ ...start, token: start.token }, pose),
    );
  }
  const end = states[to].display.get(depth);

  for (
    let frame = to + 1;
    frame < states.length &&
    end &&
    sameSlot(states[frame].display.get(depth), end);
    frame++
  ) {
    next[frame].display.set(depth, { ...next[to].display.get(depth)! });
  }
  return next;
};

export const tween = (
  states: FrameState[],
  depth: number,
  from: number,
  to: number,
  end: Partial<Pose>,
  easing = 'linear',
): FrameState[] =>
  animate(
    states,
    depth,
    from,
    to,
    Object.fromEntries(
      Object.entries(end).map(([key, value]) => [
        key,
        `${key}0 + (${value} - ${key}0) * t`,
      ]),
    ),
    easing,
  );

export const hide = (
  states: FrameState[],
  depth: number,
  from: number,
  to: number,
  how: 'alpha' | 'remove',
): FrameState[] => {
  checkRange(states, from, to);

  const next = cloneStates(states);

  for (let frame = from; frame <= to; frame++) {
    const slot = next[frame].display.get(depth);

    if (!slot) {
      continue;
    }
    if (how === 'remove') {
      next[frame].display.delete(depth);
    } else {
      next[frame].display.set(
        depth,
        withPose(slot, { ...poseOf(slot), alpha: 0 }),
      );
    }
  }
  if (how === 'remove' && next[to + 1]?.display.has(depth)) {
    const after = next[to + 1].display.get(depth)!.token;

    for (
      let frame = to + 1;
      next[frame]?.display.get(depth)?.token === after;
      frame++
    ) {
      next[frame].display.get(depth)!.token = `${after}+${to + 1}`;
    }
  }
  return next;
};

export const show = (
  states: FrameState[],
  depth: number,
  from: number,
  to: number,
  like: number,
): FrameState[] => {
  checkRange(states, from, to);

  const model = states[like]?.display.get(depth);

  if (!model) {
    throw new Error(
      `Nothing is placed at depth ${depth} in frame ${like} to show`,
    );
  }

  const next = cloneStates(states);

  for (let frame = from; frame <= to; frame++) {
    next[frame].display.set(
      depth,
      withPose({ ...model }, { ...poseOf(model), alpha: 1 }),
    );
  }
  return next;
};

export const insertFrames = (
  states: FrameState[],
  at: number,
  count: number,
): FrameState[] => {
  if (
    !Number.isInteger(at) ||
    at < 0 ||
    at > states.length ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    throw new Error(`Cannot insert ${count} frames at ${at}`);
  }

  const next = cloneStates(states);
  const model = next[at - 1]?.display ?? new Map<number, Slot>();
  const added = Array.from({ length: count }, (): FrameState => ({
    display: new Map([...model].map(([depth, slot]) => [depth, { ...slot }])),
    kept: [],
    labels: [],
  }));

  next.splice(at, 0, ...added);
  return next;
};

export const deleteFrames = (
  states: FrameState[],
  from: number,
  to: number,
): FrameState[] => {
  checkRange(states, from, to);
  if (to - from + 1 >= states.length) {
    throw new Error('A timeline keeps at least one frame');
  }

  const next = cloneStates(states);

  next.splice(from, to - from + 1);
  return next;
};

export const duplicateFrames = (
  states: FrameState[],
  from: number,
  to: number,
): FrameState[] => {
  checkRange(states, from, to);

  const next = cloneStates(states);
  const copies = cloneStates(states.slice(from, to + 1)).map((state) => ({
    ...state,
    labels: [],
    source: undefined,
  }));

  next.splice(to + 1, 0, ...copies);
  return next;
};

export const reverseFrames = (
  states: FrameState[],
  from: number,
  to: number,
): FrameState[] => {
  checkRange(states, from, to);

  const next = cloneStates(states);
  const displays = next
    .slice(from, to + 1)
    .map((state) => state.display)
    .reverse();

  displays.forEach((display, offset) => {
    next[from + offset].display = display;
    next[from + offset].source = undefined;
  });
  return next;
};

export const retimeFrames = (
  states: FrameState[],
  from: number,
  to: number,
  length: number,
): FrameState[] => {
  checkRange(states, from, to);
  if (!Number.isInteger(length) || length < 1) {
    throw new Error('A range keeps at least one frame');
  }

  const span = to - from;
  const range = cloneStates(states.slice(from, to + 1));
  const resampled = Array.from({ length }, (_, index): FrameState => {
    const at = length > 1 ? (index * span) / (length - 1) : 0;
    const low = Math.floor(at);
    const high = Math.min(span, low + 1);
    const t = at - low;
    const near = range[Math.round(at)];
    const display = new Map<number, Slot>();

    for (const [depth, slot] of near.display) {
      const a = range[low].display.get(depth);
      const b = range[high].display.get(depth);

      if (a && b && a.token === b.token && t > 0) {
        const pa = poseOf(a);
        const pb = poseOf(b);
        const pose = Object.fromEntries(
          (Object.keys(pa) as (keyof Pose)[]).map((key) => [
            key,
            pa[key] + (pb[key] - pa[key]) * t,
          ]),
        ) as unknown as Pose;

        display.set(depth, withPose(a, pose));
      } else {
        display.set(depth, { ...slot });
      }
    }
    return { display, kept: [], labels: [] };
  });

  range.forEach((state, offset) => {
    const target =
      length > 1 ? Math.round((offset * (length - 1)) / (span || 1)) : 0;

    resampled[Math.min(length - 1, target)].kept.push(...state.kept);
    resampled[Math.min(length - 1, target)].labels.push(...state.labels);
  });

  const next = cloneStates(states);

  next.splice(from, span + 1, ...resampled);
  return next;
};

export type Motion = Pose[];

export const motionOf = (
  states: FrameState[],
  depth: number,
  from: number,
  to: number,
): Motion => {
  checkRange(states, from, to);

  const start = states[from].display.get(depth);

  if (!start) {
    throw new Error(`Nothing is placed at depth ${depth} in frame ${from}`);
  }

  const base = poseOf(start);

  return states.slice(from, to + 1).map((state) => {
    const slot = state.display.get(depth);
    const pose = slot && slot.token === start.token ? poseOf(slot) : base;

    return {
      x: pose.x - base.x,
      y: pose.y - base.y,
      scaleX: base.scaleX ? pose.scaleX / base.scaleX : 1,
      scaleY: base.scaleY ? pose.scaleY / base.scaleY : 1,
      rotation: pose.rotation - base.rotation,
      skew: pose.skew - base.skew,
      alpha: pose.alpha - base.alpha,
    };
  });
};

export const applyMotion = (
  states: FrameState[],
  depth: number,
  at: number,
  motion: Motion,
  mirror?: 'x' | 'y',
): FrameState[] => {
  const start = states[at]?.display.get(depth);

  if (!start) {
    throw new Error(`Nothing is placed at depth ${depth} in frame ${at}`);
  }

  const base = poseOf(start);
  const next = cloneStates(states);
  const flipX = mirror === 'x' ? -1 : 1;
  const flipY = mirror === 'y' ? -1 : 1;
  const turn = mirror ? -1 : 1;

  motion.forEach((change, offset) => {
    const frame = at + offset;

    if (frame >= next.length) {
      return;
    }
    next[frame].display.set(
      depth,
      withPose(
        { ...start },
        {
          x: base.x + change.x * flipX,
          y: base.y + change.y * flipY,
          scaleX: base.scaleX * change.scaleX,
          scaleY: base.scaleY * change.scaleY,
          rotation: base.rotation + change.rotation * turn,
          skew: base.skew + change.skew * turn,
          alpha: base.alpha + change.alpha,
        },
      ),
    );
  });
  const last = Math.min(next.length - 1, at + motion.length - 1);
  const held = states[last].display.get(depth);

  for (
    let frame = last + 1;
    frame < states.length &&
    held &&
    sameSlot(states[frame].display.get(depth), held);
    frame++
  ) {
    next[frame].display.set(depth, { ...next[last].display.get(depth)! });
  }
  return next;
};

export type TimelineOperation =
  | {
      op: 'animate';
      depth: number;
      from: number;
      to: number;
      formulas: PoseFormulas;
      easing?: string;
    }
  | {
      op: 'tween';
      depth: number;
      from: number;
      to: number;
      end: Partial<Pose>;
      easing?: string;
    }
  | {
      op: 'hide';
      depth: number;
      from: number;
      to: number;
      how: 'alpha' | 'remove';
    }
  | { op: 'show'; depth: number; from: number; to: number; like: number }
  | { op: 'insert'; at: number; count: number }
  | { op: 'delete'; from: number; to: number }
  | { op: 'duplicate'; from: number; to: number }
  | { op: 'reverse'; from: number; to: number }
  | { op: 'retime'; from: number; to: number; length: number }
  | {
      op: 'motion';
      depth: number;
      at: number;
      motion: Motion;
      mirror?: 'x' | 'y';
    };

export const applyOperation = (
  states: FrameState[],
  operation: TimelineOperation,
): FrameState[] => {
  switch (operation.op) {
    case 'animate':
      return animate(
        states,
        operation.depth,
        operation.from,
        operation.to,
        operation.formulas,
        operation.easing,
      );
    case 'tween':
      return tween(
        states,
        operation.depth,
        operation.from,
        operation.to,
        operation.end,
        operation.easing,
      );
    case 'hide':
      return hide(
        states,
        operation.depth,
        operation.from,
        operation.to,
        operation.how,
      );
    case 'show':
      return show(
        states,
        operation.depth,
        operation.from,
        operation.to,
        operation.like,
      );
    case 'insert':
      return insertFrames(states, operation.at, operation.count);
    case 'delete':
      return deleteFrames(states, operation.from, operation.to);
    case 'duplicate':
      return duplicateFrames(states, operation.from, operation.to);
    case 'reverse':
      return reverseFrames(states, operation.from, operation.to);
    case 'motion':
      return applyMotion(
        states,
        operation.depth,
        operation.at,
        operation.motion,
        operation.mirror,
      );
    case 'retime':
      return retimeFrames(
        states,
        operation.from,
        operation.to,
        operation.length,
      );
  }
};

export interface DetectedTween {
  depth: number;
  from: number;
  to: number;
  easing: string;
  start: Pose;
  end: Pose;
  changes: (keyof Pose)[];
}

const POSE_KEYS: (keyof Pose)[] = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'skew',
  'alpha',
];

const TOLERANCE: Record<keyof Pose, number> = {
  x: 0.06,
  y: 0.06,
  scaleX: 0.002,
  scaleY: 0.002,
  rotation: 0.06,
  skew: 0.002,
  alpha: 0.006,
};

const fitEasing = (
  poses: Pose[],
): { easing: string; changes: (keyof Pose)[] } | undefined => {
  const first = poses[0];
  const last = poses[poses.length - 1];
  const n = poses.length - 1;
  const changes = POSE_KEYS.filter(
    (key) => Math.abs(last[key] - first[key]) > TOLERANCE[key],
  );

  if (!changes.length) {
    return undefined;
  }
  for (const key of POSE_KEYS.filter((each) => !changes.includes(each))) {
    if (
      poses.some((pose) => Math.abs(pose[key] - first[key]) > TOLERANCE[key])
    ) {
      return undefined;
    }
  }

  const easing = Object.entries(EASINGS).find(
    ([name, ease]) =>
      name !== 'step' &&
      poses.every((pose, i) =>
        changes.every((key) => {
          const expected = first[key] + (last[key] - first[key]) * ease(i / n);

          return (
            Math.abs(pose[key] - expected) <=
            TOLERANCE[key] + Math.abs(last[key] - first[key]) * 0.01
          );
        }),
      ),
  )?.[0];

  return easing ? { easing, changes } : undefined;
};

export const detectTweens = (states: FrameState[]): DetectedTween[] => {
  const depths = new Set(states.flatMap((state) => [...state.display.keys()]));
  const found: DetectedTween[] = [];

  for (const depth of [...depths].sort((a, b) => a - b)) {
    const slots = states.map((state) => state.display.get(depth));
    const poses = slots.map((slot) => slot && poseOf(slot));
    const moves = (at: number) =>
      !!slots[at] &&
      slots[at]!.token === slots[at - 1]?.token &&
      POSE_KEYS.some(
        (key) => Math.abs(poses[at]![key] - poses[at - 1]![key]) > 1e-6,
      );

    for (let from = 0; from < states.length - 2;) {
      let end = from;

      while (end + 1 < states.length && moves(end + 1)) {
        end++;
      }
      if (end - from < 2) {
        from = Math.max(from + 1, end);
        continue;
      }

      let matched = false;

      for (let to = end; to >= from + 2; to--) {
        const fit = fitEasing(poses.slice(from, to + 1) as Pose[]);

        if (fit) {
          found.push({
            depth,
            from,
            to,
            easing: fit.easing,
            start: poses[from]!,
            end: poses[to]!,
            changes: fit.changes,
          });
          from = to;
          matched = true;
          break;
        }
      }
      if (!matched) {
        from++;
      }
    }
  }
  return found;
};
