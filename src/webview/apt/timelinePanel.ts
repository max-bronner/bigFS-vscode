import { EASINGS, compileExpression } from '../../core/expression';
import { decodeTimeline } from '../../formats/apt/aptTimeline';
import { detectTweens } from '../../formats/apt/aptTweenDetection';
import { readMotion } from '../../formats/apt/aptTimelineEdits';
import { getPose } from '../../formats/apt/aptPose';
import type { DetectedTween } from '../../formats/apt/aptTweenDetection';
import type { Motion, TimelineOperation } from '../../formats/apt/aptTimelineEdits';
import type { Pose } from '../../formats/apt/aptPose';
import {
  MotionScriptError,
  parseMotionScript,
  tweensAsScript,
} from '../../formats/apt/motionScript';
import { blockCard } from './blocks/blockCard';
import { showDetails } from './details';
import { send } from './send';
import { createButton, byId } from './dom';
import { attachMenu, openMenu } from './popupMenu';
import type { MenuEntry } from './popupMenu';
import { currentPlayer, goToFrame, render, view } from './stage';
import { state } from './state';
import { readTimelineFlow } from '../../formats/apt/aptFlow';
import type { Jump, TimelineFlow } from '../../formats/apt/aptFlow';
import { buildDisplayList } from './timeline';
import { buildTimelineContextMenu, buildTimelineMenus } from './timelineMenus';
import type { TimelineForm, TimelineMenus } from './timelineMenus';

const panel = byId('timeline');

const selection: { from: number; to: number; anchor: number; depth?: number } =
  { from: 0, to: 0, anchor: 0 };
let form: TimelineForm | undefined;
let copied: { motion: Motion; from: string } | undefined;
let scriptText: string | undefined;
let formEasing = 'linear';

const POSE_KEYS: (keyof Pose)[] = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'skew',
  'alpha',
];

const shownTimeline = () => {
  const root = currentPlayer().root;

  return root.movie === state.movie &&
    (root.character?.type === 'sprite' || root.character?.type === 'movie')
    ? root
    : undefined;
};

const run = (operation: TimelineOperation) => {
  const timeline = shownTimeline();

  if (timeline) {
    form = undefined;
    send({ kind: 'timeline', timeline: timeline.id, operation });
  }
};

const memoised = <Result>(
  compute: (timeline: NonNullable<ReturnType<typeof shownTimeline>>) => Result,
) => {
  const cache = new WeakMap<object, Result>();

  return (timeline: NonNullable<ReturnType<typeof shownTimeline>>): Result => {
    let result = cache.get(timeline.frames);

    if (result === undefined) {
      result = compute(timeline);
      cache.set(timeline.frames, result);
    }
    return result;
  };
};

const cellsOf = memoised((frames: NonNullable<ReturnType<typeof shownTimeline>>) => {
  const depths = new Set<number>();
  const present = new Set<number>();
  const cells = frames.frames.map((frame) => {
    const marks = new Map<number, string>();

    for (const item of frame.items) {
      if (item.type === 'removeObject') {
        present.delete(item.depth);
        marks.set(item.depth, 'removed');
      } else if (item.type === 'placeObject') {
        depths.add(item.depth);
        marks.set(
          item.depth,
          !(item.flags & 1) || !present.has(item.depth) ? 'born' : 'key',
        );
        present.add(item.depth);
      }
    }
    for (const depth of present) {
      if (!marks.has(depth)) {
        marks.set(depth, 'held');
      }
    }
    return marks;
  });

  return { depths: [...depths].sort((a, b) => a - b), cells };
});

const tweensOf = memoised((timeline) => {
  const tweens = detectTweens(decodeTimeline(undefined, timeline.frames));
  const byDepth = new Map<number, DetectedTween[]>();

  for (const tween of tweens) {
    byDepth.set(tween.depth, [...(byDepth.get(tween.depth) ?? []), tween]);
  }
  return { tweens, byDepth };
});

const flowOf = memoised((timeline) =>
  readTimelineFlow(
    timeline.frames,
    timeline.movie.behaviours,
    timeline.movie.characters,
  ),
);

const poseAt = (frame: number, depth: number): Pose | undefined => {
  const timeline = shownTimeline();
  const placement = timeline
    ? buildDisplayList(timeline.frames, frame).find((each) => each.depth === depth)
    : undefined;

  return placement
    ? getPose({
        token: '',
        character: placement.character,
        matrix: placement.matrix,
        translate: placement.translate,
        colorTransform:
          placement.alpha < 1
            ? ((Math.round(placement.alpha * 255) << 24) | 0xffffff) >>> 0
            : undefined,
      })
    : undefined;
};

const round = (value: number) => Math.round(value * 1000) / 1000;

const easingSelect = (value = 'linear'): HTMLSelectElement => {
  const element = document.createElement('select');

  element.append(...Object.keys(EASINGS).map((name) => new Option(name, name)));
  element.value = value;
  return element;
};

const textInput = (value: string, placeholder = ''): HTMLInputElement => {
  const element = document.createElement('input');

  element.type = 'text';
  element.value = value;
  element.placeholder = placeholder;
  element.className = 'short';
  return element;
};

const field = (name: string, control: HTMLElement): HTMLLabelElement => {
  const element = document.createElement('label');

  element.append(name + ' ', control);
  return element;
};

const tweenForm = (depth: number): HTMLElement => {
  const end = poseAt(selection.to, depth) ?? poseAt(selection.from, depth)!;
  const inputs = POSE_KEYS.map(
    (key) => [key, textInput(String(round(end[key])))] as const,
  );
  const easing = easingSelect(formEasing);
  const element = document.createElement('div');

  element.className = 'field';
  element.append(
    ...inputs.map(([key, control]) => field(key, control)),
    field('easing', easing),
    createButton('Apply', () => {
      const values = Object.fromEntries(
        inputs.map(([key, control]) => [key, Number(control.value)]),
      );

      if (Object.values(values).some((value) => !Number.isFinite(value))) {
        return;
      }
      run({
        op: 'tween',
        depth,
        from: selection.from,
        to: selection.to,
        end: values,
        easing: easing.value,
      });
    }),
  );
  return element;
};

const formulaForm = (depth: number): HTMLElement => {
  const start = poseAt(selection.from, depth)!;
  const variables = {
    ...Object.fromEntries(POSE_KEYS.map((key) => [`${key}0`, start[key]])),
    t: 0.5,
    i: 1,
    n: 2,
    f: selection.from,
  };
  const inputs = POSE_KEYS.map(
    (key) => [key, textInput('', `${key}0`)] as const,
  );
  const easing = easingSelect();
  const error = document.createElement('span');
  const element = document.createElement('div');

  error.className = 'error-text';
  element.className = 'field';
  inputs.forEach(([, control]) => control.classList.replace('short', 'line'));
  element.append(
    ...inputs.map(([key, control]) => field(key, control)),
    field('easing for t', easing),
    createButton('Apply', () => {
      const formulas = Object.fromEntries(
        inputs
          .filter(([, control]) => control.value.trim())
          .map(([key, control]) => [key, control.value]),
      );

      try {
        Object.values(formulas).forEach((formula) =>
          compileExpression(formula)(variables),
        );
      } catch (problem) {
        error.textContent = (problem as Error).message;
        return;
      }
      run({
        op: 'animate',
        depth,
        from: selection.from,
        to: selection.to,
        formulas,
        easing: easing.value,
      });
    }),
    error,
  );
  element.title =
    't: 0 to 1 over the range, eased · i: frames since the start · n: frames in the range · f: the frame\n' +
    'x0, y0, scaleX0, scaleY0, rotation0 (degrees), skew0, alpha0 (0 to 1): the pose at the start\n' +
    '+ - * / % ^, sin cos tan asin acos atan atan2 sqrt abs min max pow floor ceil round exp log sign clamp lerp, pi, e';
  return element;
};

const SCRIPT_HELP = [
  '// depth 3, frames 0-20: x 0 -> 120 easeOut; alpha 1 -> 0',
  '// depth 3, frames 21-30: y = y0 - 40 * sin(t * pi)',
  '// depth 5, frames 10-15: fade   (or hide, show)',
  '// frames 30-40: retime 20      (or insert N, delete, duplicate, reverse)',
].join('\n');

const scriptForm = (tweens: DetectedTween[]): HTMLElement => {
  const element = document.createElement('div');
  const area = document.createElement('textarea');
  const error = document.createElement('div');

  area.className = 'code';
  area.rows = 8;
  area.spellcheck = false;
  area.value =
    scriptText ?? `${SCRIPT_HELP}\n${tweensAsScript(tweens)}`.trimEnd();
  area.oninput = () => (scriptText = area.value);
  error.className = 'error-text';
  element.append(
    area,
    createButton('Run', () => {
      const timeline = shownTimeline();

      try {
        const operations = parseMotionScript(area.value);

        if (timeline && operations.length) {
          send({ kind: 'timelineScript', timeline: timeline.id, operations });
        }
        error.textContent = '';
      } catch (problem) {
        error.textContent =
          problem instanceof MotionScriptError
            ? problem.message
            : String(problem);
      }
    }),
    createButton('From the timeline', () => {
      scriptText = undefined;
      showTimeline();
    }),
    error,
  );
  return element;
};

const countForm = (
  name: string,
  start: number,
  button: string,
  apply: (count: number) => void,
): HTMLElement => {
  const element = document.createElement('div');
  const count = textInput(String(start));

  element.className = 'field';
  element.append(
    field(name, count),
    createButton(button, () => {
      const value = Math.trunc(Number(count.value));

      if (Number.isFinite(value) && value > 0) {
        apply(value);
      }
    }),
  );
  setTimeout(() => count.select(), 0);
  return element;
};

const toggleForm = (name: TimelineForm) => {
  form = form === name ? undefined : name;
  formEasing = 'linear';
  showTimeline();
};

const findNearestPlaced = (frameCount: number): number | undefined => {
  const { from, to, depth } = selection;

  if (depth === undefined) {
    return undefined;
  }
  for (let frame = from - 1; frame >= 0; frame--) {
    if (poseAt(frame, depth)) {
      return frame;
    }
  }
  for (let frame = to + 1; frame < frameCount; frame++) {
    if (poseAt(frame, depth)) {
      return frame;
    }
  }
  return undefined;
};

const menusFor = (frameCount: number): TimelineMenus => {
  const { from, to, depth } = selection;

  return buildTimelineMenus({
    from,
    to,
    depth,
    frameCount,
    isPlacedAtDepth: depth !== undefined && !!poseAt(from, depth),
    copiedFrom: copied?.from,
    nearestPlaced: findNearestPlaced(frameCount),
    run,
    openForm: toggleForm,
    copyMotion: () => {
      const timeline = shownTimeline()!;

      copied = {
        motion: readMotion(decodeTimeline(undefined, timeline.frames), depth!, from, to),
        from: `depth ${depth}, frames ${from}–${to}`,
      };
      showTimeline();
    },
    pasteMotion: (mirror) =>
      run({ op: 'motion', depth: depth!, at: from, motion: copied!.motion, mirror }),
  });
};

const toolbar = (frameCount: number): HTMLElement => {
  const { from, to, depth } = selection;
  const element = document.createElement('div');
  const menu = (label: string, title: string, pick: (menus: TimelineMenus) => MenuEntry[]) => {
    const button = createButton(label, () => {});

    button.title = title;
    return attachMenu(button, () => pick(menusFor(frameCount)));
  };

  element.className = 'toolbar';
  element.append(
    Object.assign(document.createElement('span'), {
      className: 'muted',
      textContent:
        `Frames ${from}–${to}` +
        (depth === undefined ? ', every depth' : `, depth ${depth}`),
    }),
    menu('Frames', 'Insert, delete, duplicate, reverse or retime the selected frames', (menus) => menus.frames),
    menu('Motion', 'Tween, formula, and copying a motion from one range to another', (menus) => menus.motion),
    menu('Placement', 'Show, fade out or remove what is at the selected depth', (menus) => menus.placement),
    Object.assign(
      createButton('Script…', () => toggleForm('script')),
      { title: 'The whole timeline as a few lines, like a CSS animation: edit and run it' },
    ),
  );
  return element;
};

const openContextMenu = (x: number, y: number, frameCount: number) =>
  openMenu(
    buildTimelineContextMenu(menusFor(frameCount), () => toggleForm('script')),
    { x, y },
    panel.querySelector<HTMLElement>('.grid') ?? panel,
  );

const round2 = (value: number) => Math.round(value * 100) / 100;

const describeTween = (tween: DetectedTween): string =>
  `Tween, frames ${tween.from}–${tween.to}, ${tween.easing}: ` +
  tween.changes
    .map(
      (key) => `${key} ${round2(tween.start[key])}→${round2(tween.end[key])}`,
    )
    .join(', ') +
  '. Double-click to edit it as one tween.';

const editTween = (tween: DetectedTween) => {
  select(tween.from, tween.depth, false);
  select(tween.to, tween.depth, true);
  form = 'tween';
  formEasing = tween.easing;
  showTimeline();
};

const select = (frame: number, depth: number | undefined, extend: boolean) => {
  if (extend) {
    selection.from = Math.min(selection.anchor, frame);
    selection.to = Math.max(selection.anchor, frame);
  } else {
    selection.anchor = selection.from = selection.to = frame;
  }
  selection.depth = depth;

  const hadForm = form !== undefined;

  form = undefined;
  goToFrame(frame);
  if (depth !== undefined && poseAt(frame, depth)) {
    state.inspected = `/${depth}`;
  }
  showDetails();
  render();

  const timeline = shownTimeline();

  if (hadForm || !timeline || !refreshSelection(timeline.frames.length)) {
    showTimeline();
  }
};

const describeJump = (jump: Jump): string =>
  `${jump.from.kind === 'button' ? `button ${jump.from.character} at depth ${jump.from.depth}` : `frame ${jump.from.frame}`}: ` +
  `${jump.play ? 'gotoAndPlay' : 'gotoAndStop'} ${jump.label !== undefined ? `"${jump.label}"` : `frame ${jump.to}`}` +
  (jump.to === undefined ? ' (no such label here)' : ` → frame ${jump.to}`);

const pointTo = (cell: HTMLElement, frames: number[]) => {
  const mark = (on: boolean) =>
    frames.forEach((frame) =>
      panel
        .querySelectorAll(
          `.frame[data-frame="${frame}"], .label[data-frame="${frame}"]`,
        )
        .forEach((each) => each.classList.toggle('jump-target', on)),
    );

  cell.onmouseenter = () => mark(true);
  cell.onmouseleave = () => mark(false);
};

const labelRow = (
  table: HTMLTableElement,
  flow: TimelineFlow,
  frameCount: number,
) => {
  const row = table.insertRow();
  let next = 0;

  row.insertCell().textContent = 'labels';
  flow.labels.forEach((label, at) => {
    if (label.frame < next) {
      return;
    }
    if (label.frame > next) {
      row.insertCell().colSpan = label.frame - next;
    }

    const end =
      flow.labels.find((each) => each.frame > label.frame)?.frame ?? frameCount;
    const cell = row.insertCell();
    const names = flow.labels
      .slice(at)
      .filter((each) => each.frame === label.frame)
      .map((each) => each.label);
    const incoming = flow.jumps.filter((jump) => jump.to === label.frame);

    cell.colSpan = end - label.frame;
    cell.className = 'label';
    cell.dataset.frame = String(label.frame);
    cell.textContent = `⚑ ${names.join(', ')}`;
    cell.title =
      `Frame ${label.frame}: "${names.join('", "')}"` +
      (incoming.length
        ? `\nJumped to from:\n${incoming.map(describeJump).join('\n')}`
        : '');
    cell.onclick = () => select(label.frame, undefined, false);
    next = end;
  });
  if (next < frameCount) {
    row.insertCell().colSpan = frameCount - next;
  }
};

const scriptRow = (
  table: HTMLTableElement,
  flow: TimelineFlow,
  frameCount: number,
) => {
  const row = table.insertRow();

  row.insertCell().textContent = 'script';
  for (let frame = 0; frame < frameCount; frame++) {
    const cell = row.insertCell();
    const jumps = flow.jumps.filter((jump) => jump.from.frame === frame);
    const lines = [
      ...(flow.stops.includes(frame) ? ['stop()'] : []),
      ...(flow.plays.includes(frame) ? ['play()'] : []),
      ...jumps.map(describeJump),
      ...(flow.conditional.includes(frame)
        ? ['the script branches; it may do more than this']
        : []),
    ];

    cell.className = 'flow';
    cell.dataset.frame = String(frame);
    cell.textContent =
      (flow.stops.includes(frame) ? '■' : '') +
      (flow.plays.includes(frame) ? '▶' : '') +
      (jumps.length ? '↷' : '') +
      (flow.conditional.includes(frame) ? '?' : '');
    if (!lines.length) {
      continue;
    }
    cell.title = lines.join('\n');

    const targets = jumps.flatMap((jump) =>
      jump.to === undefined ? [] : [jump.to],
    );

    pointTo(cell, targets);
    cell.onclick = () => select(targets[0] ?? frame, undefined, false);
  }
};

const isPicked = (frame: number, depth: number): boolean =>
  frame >= selection.from &&
  frame <= selection.to &&
  (selection.depth === undefined || selection.depth === depth);

let shownBar: HTMLElement | undefined;

const refreshSelection = (frameCount: number): boolean => {
  if (!shownBar?.isConnected) {
    return false;
  }
  panel.querySelectorAll<HTMLElement>('.cell').forEach((cell) => {
    cell.classList.toggle(
      'picked',
      isPicked(Number(cell.dataset.frame), Number(cell.dataset.depth)),
    );
  });
  const bar = toolbar(frameCount);

  shownBar.replaceWith(bar);
  shownBar = bar;
  return true;
};

export const showTimeline = (): void => {
  const timeline = shownTimeline();

  if (!timeline || view.interact) {
    panel.replaceChildren();
    return;
  }

  const frameCount = timeline.frames.length;

  selection.to = Math.min(selection.to, frameCount - 1);
  selection.from = Math.min(selection.from, selection.to);

  const { depths, cells } = cellsOf(timeline);
  const { tweens, byDepth } = tweensOf(timeline);
  const table = document.createElement('table');
  const flow = flowOf(timeline);

  labelRow(table, flow, frameCount);

  const head = table.insertRow();

  head.insertCell().textContent = 'frame';
  timeline.frames.forEach((frame, index) => {
    const cell = head.insertCell();
    const scripts = frame.items.filter(
      (item) => item.type === 'action' || item.type === 'initAction',
    ).length;

    cell.className = 'frame';
    cell.dataset.frame = String(index);
    cell.textContent = index % 5 ? '' : String(index);
    cell.title =
      `Frame ${index}` +
      (scripts ? `, ${scripts} script${scripts > 1 ? 's' : ''}` : '');
    cell.onclick = (event) => select(index, undefined, event.shiftKey);
    cell.oncontextmenu = (event) => {
      event.preventDefault();
      if (selection.depth !== undefined || index < selection.from || index > selection.to) {
        select(index, undefined, false);
      }
      openContextMenu(event.clientX, event.clientY, frameCount);
    };
  });
  scriptRow(table, flow, frameCount);

  for (const depth of depths) {
    const line = table.insertRow();
    const name = line.insertCell();

    name.textContent = String(depth);
    name.className = 'depth';
    cells.forEach((marks, frame) => {
      const cell = line.insertCell();
      const mark = marks.get(depth);
      const tween = byDepth
        .get(depth)
        ?.find((each) => each.from <= frame && frame <= each.to);

      cell.className = `cell ${mark ?? 'empty'}`;
      if (tween) {
        cell.classList.add('tween');
        if (frame === tween.from) {
          cell.classList.add('tween-start');
        }
        cell.title = describeTween(tween);
        cell.ondblclick = () => editTween(tween);
      }
      cell.dataset.frame = String(frame);
      cell.dataset.depth = String(depth);
      cell.classList.toggle('picked', isPicked(frame, depth));
      cell.onclick = (event) => select(frame, depth, event.shiftKey);
      cell.oncontextmenu = (event) => {
        event.preventDefault();
        if (!isPicked(frame, depth)) {
          select(frame, depth, false);
        }
        openContextMenu(event.clientX, event.clientY, frameCount);
      };
    });
  }

  const scroller = document.createElement('div');

  scroller.className = 'grid';
  scroller.tabIndex = 0;
  scroller.title = 'Click a cell to select it, Shift+click to select a range; right-click or Shift+F10 for its commands';
  scroller.append(table);
  scroller.addEventListener('keydown', (event) => {
    if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      const box = (scroller.querySelector('.picked') ?? scroller).getBoundingClientRect();

      event.preventDefault();
      openContextMenu(box.left, box.bottom, frameCount);
    }
  });

  const forms =
    form === 'script'
      ? [scriptForm(tweens)]
      : form === 'insert'
        ? [
            countForm('Frames to insert after frame ' + selection.to, 1, 'Insert', (count) =>
              run({ op: 'insert', at: selection.to + 1, count }),
            ),
          ]
        : form === 'retime'
          ? [
              countForm(
                `Retime frames ${selection.from}–${selection.to} to`,
                selection.to - selection.from + 1,
                'Retime',
                (length) => run({ op: 'retime', from: selection.from, to: selection.to, length }),
              ),
            ]
          : form &&
          selection.depth !== undefined &&
          poseAt(selection.from, selection.depth)
        ? [
            form === 'tween'
              ? tweenForm(selection.depth)
              : formulaForm(selection.depth),
          ]
        : [];
  const bar = toolbar(frameCount);

  shownBar = bar;

  const previous = panel.querySelector('.grid')?.scrollLeft ?? 0;

  panel.replaceChildren(
    blockCard({
      key: 'timeline',
      kind: 'timeline',
      title: 'Timeline',
      summary: `${frameCount} frame${frameCount === 1 ? '' : 's'}`,
      open: true,
      body: () => [bar, ...forms, scroller],
    }),
  );
  scroller.scrollLeft = previous;
  markPlayhead();
};

export const setOnion = (frames: number): void => {
  view.onion = frames;
  render();
};

export const markPlayhead = (): void => {
  panel
    .querySelectorAll('.now')
    .forEach((cell) => cell.classList.remove('now'));
  panel
    .querySelectorAll(`[data-frame="${state.frame}"]`)
    .forEach((cell) => cell.classList.add('now'));
};
