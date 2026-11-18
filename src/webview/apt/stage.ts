import { engine, onEngineLog, watchMovie } from "./engineState";
import { fetchMovie } from "./movieLoads";
import type { Rect } from "../../formats/apt/aptMovie";
import { byId } from "./dom";
import { maskArea, paintLeaf } from "./paint";
import { Player } from "./player";
import type { Instance } from "./player";
import { resolve } from "./resolve";
import { boundsOf, collect, localBounds, transformRect, union } from "./scene";
import type { Affine, HitArea, Leaf } from "./scene";
import { movie, state } from "./state";

const EXTRA_SAMPLES = 240;
const MAX_SAMPLES = 600;
const MARGIN = 16;
const LOG_LINES = 8;

const FRAME_RATE = 30;

export const view = {
  origin: true,
  wireframe: false,
  onion: 0,
  boxes: true,
  masks: true,
  scripts: true,
  interact: false,
  playing: false,
  speed: 1,
};

const stage = byId<HTMLCanvasElement>("stage");
const zoomSelect = byId<HTMLSelectElement>("zoom");
const frameInput = byId<HTMLInputElement>("frame");
const frameLabel = byId("frame-label");
const modeLabel = byId("mode");
const logList = byId("log");

let onInspect: () => void = () => {};
let onRendered: () => void = () => {};

const afterRender: ((ctx: CanvasRenderingContext2D, base: Affine) => void)[] = [];

export const addRenderHook = (
  hook: (ctx: CanvasRenderingContext2D, base: Affine) => void,
): void => {
  afterRender.push(hook);
};

export const setInspectorView = (
  show: () => void,
  update: () => void,
): void => {
  onInspect = show;
  onRendered = update;
};

export interface StageTool {
  down(point: [number, number], event: MouseEvent): boolean;
  move(point: [number, number], event: MouseEvent): boolean;
  up(): void;
  draw(ctx: CanvasRenderingContext2D, pixel: number): void;
  cursor(point: [number, number]): string | undefined;
}

const tools: StageTool[] = [];

export const addTool = (next: StageTool): void => {
  tools.unshift(next);
};

let holder: StageTool | undefined;

let player: Player | undefined;
let extent: Rect | undefined;
let scene: { leaves: Leaf[]; hits: HitArea[] } = { leaves: [], hits: [] };
let base: Affine = [1, 0, 0, 1, 0, 0];
let hovered: Instance | undefined;
let pressed: Instance | undefined;
const log: string[] = [];
const ghosts = new Map<number, Leaf[]>();

const ghostOf = (frame: number): Leaf[] => {
  let leaves = ghosts.get(frame);

  if (!leaves) {
    const ghost = newPlayer(false, false);

    while (ghost.ticks < frame) {
      ghost.tick();
    }
    leaves = collect(ghost).leaves;
    ghosts.set(frame, leaves);
  }
  return leaves;
};

const newPlayer = (rootScripts: boolean, logged: boolean) => {
  if (logged) {
    watchMovie(movie());
  }
  return new Player(movie(), state.selected, {
    resolve,
    scripts: view.scripts,
    rootScripts,
    log: logged ? addLog : undefined,
    engine: logged ? engine : undefined,
    fetchMovie: logged ? fetchMovie : undefined,
  });
};

const addLog = (line: string): void => {
  log.push(line);
  log.splice(0, Math.max(0, log.length - LOG_LINES));
  logList.replaceChildren(
    ...log.map((text) => {
      const element = document.createElement("div");

      element.textContent = text;
      return element;
    }),
  );
};

const rootScriptsRun = () => view.interact || view.scripts;

onEngineLog((line) => addLog(line));

export const currentPlayer = (): Player => {
  player ??= newPlayer(rootScriptsRun(), true);
  return player;
};

export const restart = (): void => {
  player = undefined;
  ghosts.clear();
  extent = undefined;
  hovered = undefined;
  pressed = undefined;
  state.inspected = undefined;
};

export const remeasure = (): void => {
  extent = undefined;
};

export const rootFrames = (): number => currentPlayer().root.frames.length;

export const goToFrame = (frame: number): void => {
  const count = rootFrames();
  const target = count ? Math.max(0, Math.min(count - 1, frame)) : 0;

  if (rootScriptsRun()) {
    const root = currentPlayer().root;

    if (target === root.frame) {
      root.playing = root.playing && view.playing;
    } else {
      currentPlayer().goTo(root, target, view.playing);
    }
  } else {
    if (target < currentPlayer().root.frame || currentPlayer().ticks > target) {
      player = newPlayer(false, true);
    }
    while (currentPlayer().ticks < target) {
      currentPlayer().tick();
    }
  }
  state.frame = currentPlayer().root.frame;
};

const measure = (): Rect => {
  const shown = resolve(movie(), state.selected);

  if (shown?.character.type === "movie") {
    return [
      0,
      0,
      shown.movie.record.screenWidth,
      shown.movie.record.screenHeight,
    ];
  }

  const sample = newPlayer(false, false);
  const samples = Math.min(
    MAX_SAMPLES,
    sample.root.frames.length + EXTRA_SAMPLES,
  );
  const boxes: Rect[] = [];

  for (let tick = 0; tick < samples; tick++) {
    const box = boundsOf(collect(sample).leaves, view.masks);

    if (box) {
      boxes.push(box);
    }
    sample.tick();
  }
  return union([...boxes, [0, 0, 0, 0]])!;
};

const round = (value: number) => Math.round(value * 10) / 10;
const formatRect = ([left, top, right, bottom]: Rect) =>
  `${round(right - left)}×${round(bottom - top)} at (${round(left)}, ${round(top)})`;

export const showMode = (): void => {
  modeLabel.textContent = [
    view.interact ? "interact" : "inspect",
    view.playing
      ? `playing at ${view.speed}× (${Math.round(FRAME_RATE * view.speed * 10) / 10} frames/s)`
      : `paused at ${view.speed}×`,
    `origin ${view.origin ? "on" : "off"}`,
    `boxes ${view.boxes ? "on" : "off"}`,
    `masks ${view.masks ? "applied" : "shown"}`,
    `action scripts ${view.scripts ? "respected" : "ignored"}`,
    `wireframe ${view.wireframe ? "on" : "off"}`,
    `onion ${view.onion ? `±${view.onion}` : "off"}`,
  ].join(" · ");
};

export const sceneLeaves = (): Leaf[] => scene.leaves;

export const stageExtent = (): Rect | undefined => extent;

export const pixelSize = (): number =>
  1 / (base[0] / (window.devicePixelRatio || 1));

const inspectable = (leaf: Leaf, deep: boolean): Instance => {
  let at: Instance = leaf.instance;

  if (!deep) {
    while (at.parent && at.parent !== currentPlayer().root) {
      at = at.parent;
    }
    return at;
  }
  while (
    at.parent &&
    !["sprite", "button"].includes(at.character?.type ?? "")
  ) {
    at = at.parent;
  }
  return at;
};

export const instanceBox = (instance: Instance): Rect | undefined =>
  boundsOf(
    scene.leaves.filter((leaf) => {
      for (let at: Instance | undefined = leaf.instance; at; at = at.parent) {
        if (at === instance) {
          return true;
        }
      }
      return false;
    }),
  );

const HIDDEN_ALPHA = 0.25;

const outlineMasks = (ctx: CanvasRenderingContext2D) => {
  const masks = new Set(scene.leaves.flatMap((leaf) => leaf.masks ?? []));

  ctx.save();
  ctx.setTransform(...base);
  ctx.lineWidth = 2 / base[0];
  ctx.setLineDash([6 / base[0], 4 / base[0]]);
  ctx.strokeStyle = "rgba(0, 220, 255, 0.95)";
  ctx.fillStyle = "rgba(0, 220, 255, 0.08)";
  for (const mask of masks) {
    const area = maskArea(mask);

    ctx.fill(area);
    ctx.stroke(area);
  }
  ctx.restore();
};

export const render = (): void => {
  const current = currentPlayer();

  scene = collect(current);

  const frameBox = boundsOf(scene.leaves, view.masks);

  extent ??= measure();
  if (frameBox) {
    extent = union([extent, frameBox])!;
  }

  const [left, top, right, bottom] = extent;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const zoom =
    zoomSelect.value === "fit"
      ? Math.min(
          4,
          Math.max(
            0.05,
            Math.min(
              (stage.parentElement!.clientWidth - 24) / (width + 2 * MARGIN),
              (window.innerHeight - 230) / (height + 2 * MARGIN),
            ),
          ),
        )
      : Number(zoomSelect.value);
  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.ceil((width + 2 * MARGIN) * zoom * ratio);
  const pixelHeight = Math.ceil((height + 2 * MARGIN) * zoom * ratio);

  if (stage.width !== pixelWidth || stage.height !== pixelHeight) {
    stage.width = pixelWidth;
    stage.height = pixelHeight;
    stage.style.width = pixelWidth / ratio + "px";
    stage.style.height = pixelHeight / ratio + "px";
  }

  const ctx = stage.getContext("2d")!;
  const scale = zoom * ratio;

  base = [scale, 0, 0, scale, (MARGIN - left) * scale, (MARGIN - top) * scale];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, stage.width, stage.height);

  if (view.onion && !view.interact && !view.playing) {
    const root = current.root.frame;

    for (let offset = -view.onion; offset <= view.onion; offset++) {
      const frame = root + offset;

      if (!offset || frame < 0 || frame >= current.root.frames.length) {
        continue;
      }
      for (const leaf of ghostOf(frame)) {
        ctx.save();
        ctx.setTransform(...base);
        ctx.transform(...leaf.matrix);
        ctx.globalAlpha = (leaf.alpha * 0.3) / Math.abs(offset);
        paintLeaf(ctx, leaf);
        ctx.restore();
      }
    }
  }
  for (const leaf of scene.leaves) {
    if (!view.masks && leaf.masks) {
      ctx.save();
      ctx.setTransform(...base);
      ctx.transform(...leaf.matrix);
      ctx.globalAlpha = leaf.alpha * HIDDEN_ALPHA;
      paintLeaf(ctx, leaf);
      ctx.restore();
    }
    ctx.save();
    ctx.setTransform(...base);
    for (const mask of leaf.masks ?? []) {
      if (!mask.length) {
        continue;
      }
      ctx.clip(maskArea(mask));
    }
    ctx.transform(...leaf.matrix);
    ctx.globalAlpha = leaf.alpha;
    paintLeaf(ctx, leaf);
    ctx.restore();
  }
  if (!view.masks) {
    outlineMasks(ctx);
  }

  ctx.setTransform(...base);
  overlays(ctx, frameBox, scale, extent);
  showFrame(frameBox);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  afterRender.forEach((hook) => hook(ctx, base));
  onRendered();
};

const overlays = (
  ctx: CanvasRenderingContext2D,
  frameBox: Rect | undefined,
  scale: number,
  [left, top, right, bottom]: Rect,
) => {
  const pixel = (window.devicePixelRatio || 1) / scale;
  const box = ([l, t, r, b]: Rect) => ctx.strokeRect(l, t, r - l, b - t);

  ctx.lineWidth = pixel;
  ctx.font = `${11 * pixel}px sans-serif`;
  ctx.textBaseline = "bottom";

  if (view.boxes) {
    const byChild = new Map<number, Rect[]>();

    for (const leaf of scene.leaves) {
      if (leaf.top !== undefined) {
        const boxes = byChild.get(leaf.top) ?? [];

        boxes.push(transformRect(leaf.matrix, localBounds(leaf)));
        byChild.set(leaf.top, boxes);
      }
    }

    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,200,255,0.55)";
    ctx.fillStyle = "rgba(0,200,255,0.9)";
    for (const [depth, boxes] of byChild) {
      const rect = union(boxes)!;

      box(rect);
      ctx.fillText(`@${depth}`, rect[0] + 2 * pixel, rect[1] - pixel);
    }

    if (frameBox) {
      ctx.setLineDash([6 * pixel, 4 * pixel]);
      ctx.strokeStyle = "rgba(255,220,0,0.95)";
      box(frameBox);
    }
  }

  if (view.origin) {
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,60,60,0.8)";
    ctx.beginPath();
    ctx.moveTo(left - MARGIN, 0);
    ctx.lineTo(right + MARGIN, 0);
    ctx.moveTo(0, top - MARGIN);
    ctx.lineTo(0, bottom + MARGIN);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3 * pixel, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const each of [...tools].reverse()) {
    ctx.save();
    each.draw(ctx, pixel);
    ctx.restore();
  }

  ctx.setLineDash([]);
  for (const [instance, colour, width] of [
    [hovered, "rgba(255,0,255,0.6)", 1],
    [inspected(), "rgba(255,0,255,1)", 2],
  ] as const) {
    const rect = instance && instanceBox(instance);

    if (rect) {
      ctx.lineWidth = pixel * width;
      ctx.strokeStyle = colour;
      box(rect);
    }
  }
};

export const inspected = (): Instance | undefined =>
  state.inspected === undefined
    ? undefined
    : currentPlayer().find(state.inspected);

const showFrame = (frameBox: Rect | undefined) => {
  const count = rootFrames();
  const ticks = currentPlayer().ticks;

  frameInput.value = String(state.frame);
  frameLabel.textContent =
    (count ? `frame ${state.frame} of ${count}` : "no timeline") +
    (ticks !== state.frame ? ` · tick ${ticks}` : "") +
    (frameBox ? ` · ${formatRect(frameBox)}` : "");
};

export const pointAt = (event: MouseEvent): [number, number] => {
  const ratio = window.devicePixelRatio || 1;

  return [
    (event.offsetX * ratio - base[4]) / base[0],
    (event.offsetY * ratio - base[5]) / base[3],
  ];
};

const covers = (leaf: Leaf, [x, y]: [number, number]): boolean => {
  const [a, b, c, d, tx, ty] = leaf.matrix;
  const det = a * d - b * c;

  if (!det) {
    return false;
  }

  const lx = (d * (x - tx) - c * (y - ty)) / det;
  const ly = (a * (y - ty) - b * (x - tx)) / det;

  if (leaf.character?.type === "shape") {
    return (leaf.movie.shapes[leaf.id] ?? []).some((run) => {
      const t = run.triangles;

      for (let i = 0; i < t.length; i += 6) {
        if (
          inTriangle(
            lx,
            ly,
            t[i],
            t[i + 1],
            t[i + 2],
            t[i + 3],
            t[i + 4],
            t[i + 5],
          )
        ) {
          return true;
        }
      }
      return false;
    });
  }

  const [l, top, r, bottom] = localBounds(leaf);

  return lx >= l && lx <= r && ly >= top && ly <= bottom;
};

const inTriangle = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean => {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);

  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

const buttonAt = (point: [number, number]): Instance | undefined => {
  for (let index = scene.hits.length - 1; index >= 0; index--) {
    if (covers(scene.hits[index].leaf, point)) {
      return scene.hits[index].button;
    }
  }
  return undefined;
};

const instanceAt = (
  point: [number, number],
  deep = false,
): Instance | undefined => {
  for (let index = scene.leaves.length - 1; index >= 0; index--) {
    if (covers(scene.leaves[index], point)) {
      return inspectable(scene.leaves[index], deep);
    }
  }
  return undefined;
};

stage.addEventListener("mousemove", (event) => {
  if (!state.movie) {
    return;
  }

  const point = pointAt(event);

  if (!view.interact && holder?.move(point, event)) {
    return;
  }

  if (view.interact) {
    const next = buttonAt(point);

    if (next !== hovered) {
      currentPlayer().hover(hovered, next);
      hovered = next;
      render();
    }
    stage.style.cursor = next ? "pointer" : "default";
  } else {
    const next = instanceAt(point);

    stage.style.cursor =
      tools.map((each) => each.cursor(point)).find(Boolean) ?? "default";
    if (next !== hovered) {
      hovered = next;
      stage.title = next ? next.path || "the shown character" : "";
      render();
    }
  }
});

stage.addEventListener("mouseleave", () => {
  if (view.interact && hovered) {
    currentPlayer().hover(hovered, undefined);
  }
  hovered = undefined;
  if (state.movie) {
    render();
  }
});

stage.addEventListener("mousedown", (event) => {
  if (!state.movie) {
    return;
  }
  if (view.interact) {
    if (hovered) {
      pressed = hovered;
      currentPlayer().press(hovered);
      render();
    }
    return;
  }

  holder = tools.find((each) => each.down(pointAt(event), event));
  if (holder) {
    return;
  }

  const picked = instanceAt(pointAt(event), event.detail >= 2);

  state.inspected = picked?.path;
  onInspect();
  render();
});

window.addEventListener("mouseup", () => {
  holder?.up();
  holder = undefined;
  if (view.interact && pressed) {
    currentPlayer().release(pressed, pressed === hovered);
    pressed = undefined;
    render();
  }
});

let lastTime: number | undefined;
let owed = 0;

const loop = (time: number) => {
  if (!view.playing) {
    lastTime = undefined;
    return;
  }

  owed +=
    lastTime === undefined
      ? 0
      : ((time - lastTime) / 1000) * FRAME_RATE * view.speed;
  lastTime = time;

  const steps = Math.min(8, Math.floor(owed));

  if (steps > 0) {
    owed -= Math.floor(owed);
    for (let step = 0; step < steps; step++) {
      currentPlayer().tick();
    }
    state.frame = currentPlayer().root.frame;
    render();
  }
  requestAnimationFrame(loop);
};

export const playFrom = (frame: number): void => {
  player = undefined;
  if (frame) {
    currentPlayer().goTo(currentPlayer().root, frame, true);
  }
  state.frame = currentPlayer().root.frame;
  play(true);
  render();
};

export const play = (playing: boolean): void => {
  view.playing = playing;
  owed = 0;
  byId("play").textContent = playing ? "⏸" : "▶";
  showMode();
  if (playing) {
    requestAnimationFrame(loop);
  }
};
