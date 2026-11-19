import { engine, onEngineLog, watchMovie } from "./engineState";
import { fetchMovie } from "./movieLoads";
import type { Rect } from "../../formats/apt/aptMovie";
import { byId } from "./dom";
import { BACKDROP_CALL } from "../../game/apt/engineImages";
import { findGadgetOf, isEngineSurface } from "./gadgetModel";
import { paintBackdrop, paintImageSurface } from "./imageSurface";
import { buildMaskArea, paintLeaf } from "./paint";
import { Player } from "./player";
import type { Instance } from "./instance";
import { resolve } from "./resolve";
import {
  getLeafBounds,
  collect,
  getLocalBounds,
  transformRect,
  union,
} from "./scene";
import { isMovieSettled } from "./isMovieSettled";
import { growExtent } from "./stageExtent";
import { fitZoom, getFitSpace } from "./stageFit";
import { attachStagePointer } from "./stagePointer";
import type { StageTool } from "./stagePointer";
import { isDrawnAt } from "./hitTest";
import type { Affine, HitArea, Leaf } from "./scene";
import { movie, state } from "./state";
import { paintView3d } from "./view3dSurface";

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

const tools: StageTool[] = [];

export const addTool = (next: StageTool): void => {
  tools.unshift(next);
};

let player: Player | undefined;
let extent: Rect | undefined;
let scene: { leaves: Leaf[]; hits: HitArea[] } = { leaves: [], hits: [] };
let base: Affine = [1, 0, 0, 1, 0, 0];
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

let logDirty = false;

const flushLog = (): void => {
  if (!logDirty) {
    return;
  }
  logDirty = false;
  logList.replaceChildren(
    ...log.map((text) => {
      const element = document.createElement("div");

      element.textContent = text;
      return element;
    }),
  );
};

const addLog = (line: string): void => {
  log.push(line);
  log.splice(0, Math.max(0, log.length - LOG_LINES));
  if (!logDirty) {
    logDirty = true;
    requestAnimationFrame(flushLog);
  }
};

const rootScriptsRun = () => view.interact || view.scripts;

onEngineLog((line) => addLog(line));

export const currentPlayer = (): Player => {
  player ??= newPlayer(rootScriptsRun(), true);
  return player;
};

const discardPlayer = (): void => {
  player?.dispose();
  player = undefined;
};

export const restart = (): void => {
  discardPlayer();
  ghosts.clear();
  extent = undefined;
  stagePointer.reset();
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
    const box = getLeafBounds(collect(sample).leaves, view.masks);

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

export const getSceneLeaves = (): Leaf[] => scene.leaves;

export const getStageExtent = (): Rect | undefined => extent;

export const getPixelSize = (): number =>
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

export const measureInstanceBox = (instance: Instance): Rect | undefined =>
  getLeafBounds(
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
    const area = buildMaskArea(mask);

    ctx.fill(area);
    ctx.stroke(area);
  }
  ctx.restore();
};

let drawPass = 0;

const paintOnStage = (ctx: CanvasRenderingContext2D, leaf: Leaf): void => {
  const current = currentPlayer();
  const gadget = leaf.surfaceBox && findGadgetOf(current, leaf.instance);

  if (!gadget) {
    paintLeaf(ctx, leaf);
  } else if (gadget.kind === "image") {
    paintImageSurface(ctx, leaf, gadget, leaf.surfaceBox!);
  } else if (gadget.kind === "view3d") {
    paintView3d(ctx, gadget, leaf.surfaceBox!, {
      player: current,
      pass: drawPass,
      isPlaying: view.playing,
    });
  }
};

export const render = (): void => {
  flushLog();
  const current = currentPlayer();

  drawPass++;
  scene = collect(current, (instance) => isEngineSurface(current, instance));

  const frameBox = getLeafBounds(scene.leaves, view.masks);

  extent ??= measure();
  extent = growExtent(extent, frameBox, {
    isScreen: resolve(movie(), state.selected)?.character.type === "movie",
    isAnimating: view.playing || view.interact,
  });

  const [left, top, right, bottom] = extent;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const zoom =
    zoomSelect.value === "fit"
      ? fitZoom(getFitSpace(stage, window.innerHeight), { width, height }, MARGIN)
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

  const shown = resolve(movie(), state.selected);

  if (shown?.character.type === "movie" && engine.calls.has(BACKDROP_CALL.toLowerCase())) {
    const { screenWidth, screenHeight } = shown.movie.record;

    ctx.save();
    ctx.setTransform(...base);
    paintBackdrop(ctx, [0, 0, screenWidth, screenHeight]);
    ctx.restore();
  }

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
      paintOnStage(ctx, leaf);
      ctx.restore();
    }
    ctx.save();
    ctx.setTransform(...base);
    for (const mask of leaf.masks ?? []) {
      if (!mask.length) {
        continue;
      }
      ctx.clip(buildMaskArea(mask));
    }
    ctx.transform(...leaf.matrix);
    ctx.globalAlpha = leaf.alpha;
    paintOnStage(ctx, leaf);
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

        boxes.push(transformRect(leaf.matrix, getLocalBounds(leaf)));
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
    [stagePointer.getHovered(), "rgba(255,0,255,0.6)", 1],
    [getInspectedInstance(), "rgba(255,0,255,1)", 2],
  ] as const) {
    const rect = instance && measureInstanceBox(instance);

    if (rect) {
      ctx.lineWidth = pixel * width;
      ctx.strokeStyle = colour;
      box(rect);
    }
  }
};

export const getInspectedInstance = (): Instance | undefined =>
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

const findInstanceAt = (
  point: [number, number],
  deep = false,
): Instance | undefined => {
  for (let index = scene.leaves.length - 1; index >= 0; index--) {
    if (isDrawnAt(scene.leaves[index], point)) {
      return inspectable(scene.leaves[index], deep);
    }
  }
  return undefined;
};

const stagePointer = attachStagePointer(stage, {
  tools,
  isInteractive: () => view.interact,
  hasMovie: () => !!state.movie,
  getPlayer: currentPlayer,
  getHits: () => scene.hits,
  pointAt,
  findInstanceAt,
  inspect: (instance) => {
    state.inspected = instance?.path;
    onInspect();
    render();
  },
  render,
});

let lastTime: number | undefined;
let owed = 0;
let pendingFrame: number | undefined;

const scheduleLoop = (): void => {
  pendingFrame ??= requestAnimationFrame((time) => {
    pendingFrame = undefined;
    loop(time);
  });
};

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
    if (isMovieSettled(currentPlayer().root, currentPlayer().ticks)) {
      engine.makeRepeatedCalls();
    }
    state.frame = currentPlayer().root.frame;
    render();
    if (stagePointer.updateAfterFrame()) {
      render();
    }
  }
  scheduleLoop();
};

export const playFrom = (frame: number): void => {
  discardPlayer();
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
    scheduleLoop();
  }
};
