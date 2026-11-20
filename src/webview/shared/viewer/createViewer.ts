import {
  describeForeignClip,
  isOwnClip,
  poseAt,
} from '../../../formats/w3d/w3dPose';
import type { Pose, Vec3 } from '../../../formats/w3d/w3dPose';
import type { W3dAnimation } from '../../../formats/w3d/w3dAnimation';
import { isSurfaceAnimated } from '../../../formats/w3d/isSurfaceAnimated';
import type {
  SceneSkeleton,
  SubObjectRule,
} from '../../../formats/w3d/w3dScene';
import { element } from '../element';
import { createModelRenderer } from '../modelRenderer';
import { createOrbit } from '../orbit';
import type { Orbit } from '../orbit';
import type { CameraBasis } from '../orbitBasis';
import { buildGridLines } from './buildGridLines';
import { getClipFrame, getClipSeconds } from './clipTiming';
import { createClipPicker } from './createClipPicker';
import type { ClipList } from './createClipPicker';
import { createLineRenderer } from './createLineRenderer';
import type { DrawLines } from './createLineRenderer';
import { createPartsPanel } from './createPartsPanel';
import { createTransport } from './createTransport';
import { createBoneLabels } from './createBoneLabels';
import { createViewControls } from './createViewControls';
import type { SkyMemory } from './createViewControls';
import { describeDetailLevels, describeModel } from './describeModel';
import type { ViewerModel } from './describeModel';
import { adoptViewerStyle } from './viewerStyle';

export interface ViewerCamera {
  basis: CameraBasis;
  matrix: Float32Array;
}

export interface FrameAdjustment {
  shake?: number;
  modelOffset?: Vec3;
}

export interface ViewerLayer {
  getLength?(): number;
  isBusy?(): boolean;
  onAdvance?(time: number): void;
  onSeek?(time: number): void;
  onRestart?(): void;
  onFrame?(now: number): void;
  prepareFrame?(): FrameAdjustment;
  draw?(camera: ViewerCamera): void;
  onKey?(key: string): boolean;
}

export interface ViewerClip {
  id: string;
  animation: W3dAnimation;
  skeleton?: SceneSkeleton;
}

export interface ViewerOptions {
  onPickClip(id: string): void;
  partsHint?: string;
  sky?: SkyMemory;
  target?: Vec3;
  radius?: number;
}

export interface Viewer {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | undefined;
  stage: HTMLElement;
  side: HTMLElement;
  bar: HTMLElement;
  orbit: Orbit;
  drawLines: DrawLines;
  addLayer(layer: ViewerLayer): void;
  setModel(model: ViewerModel | undefined): void;
  getModel(): ViewerModel | undefined;
  getPose(): Pose | undefined;
  setClips(list: ClipList): void;
  playClip(clip: ViewerClip): void;
  clearClip(notice?: string): void;
  showClipChoice(id: string | undefined): void;
  setSubObjectRules(rules: SubObjectRule[]): void;
  restart(): void;
  getTime(): number;
  isPlaying(): boolean;
  showStatus(text: string): void;
  getCamera(): ViewerCamera;
}

const DEFAULT_TARGET: Vec3 = [0, 0, 20];
const DEFAULT_RADIUS = 85;
const CONTROLS_HELP =
  'drag to orbit, right-drag to pan, scroll to zoom, double-click to reset, B for bones';
const MAX_FRAME_SECONDS = 0.25;

const getBoundsSphere = ({ bounds }: ViewerModel): [Vec3, number] => [
  [0, 1, 2].map((axis) => (bounds.min[axis] + bounds.max[axis]) / 2) as Vec3,
  Math.max(
    1e-3,
    Math.hypot(...[0, 1, 2].map((axis) => bounds.max[axis] - bounds.min[axis])) / 2,
  ),
];

const openContext = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ?? undefined;

  try {
    return gl && { gl, renderer: createModelRenderer(gl), drawLines: createLineRenderer(gl) };
  } catch (error) {
    console.error(error);
    return undefined;
  }
};

export const createViewer = (
  root: HTMLElement,
  {
    onPickClip,
    partsHint,
    sky: skyMemory,
    target = DEFAULT_TARGET,
    radius = DEFAULT_RADIUS,
  }: ViewerOptions,
): Viewer => {
  adoptViewerStyle();

  const layers: ViewerLayer[] = [];
  const canvas = element('canvas', undefined, 'viewer-canvas');
  const stage = element('div', undefined, 'viewer-stage');
  const side = element('div', undefined, 'viewer-side');
  const main = element('div', undefined, 'viewer-main');
  const transportBar = element('div', undefined, 'viewer-bar');
  const viewBar = element('div', undefined, 'viewer-bar');
  const status = element('span', undefined, 'viewer-status');
  const facts = element('p');
  const clipNotice = element('p');
  const levelFacts = element('p');
  const help = element('p', CONTROLS_HELP);
  const graphics = openContext(canvas);
  const orbit = createOrbit(canvas, target, radius, () => invalidate());

  let model: ViewerModel | undefined;
  let clip: ViewerClip | undefined;
  let pose: Pose | undefined;
  let rules: SubObjectRule[] = [];
  let animatesMaterials = false;
  let isFramed = false;
  let needsDraw = true;
  let grid = buildGridLines(0);
  let lastFrame = performance.now();

  const invalidate = () => {
    needsDraw = true;
  };
  const showStatus = (text: string) => {
    status.textContent = text;
  };

  const applyTime = () => {
    const skeleton = model?.skeleton;
    const frame = clip ? getClipFrame(clip.animation, transport.getTime()) : 0;

    pose = skeleton && poseAt(skeleton, clip?.animation, frame);
    if (skeleton) {
      graphics?.renderer.setPose(pose);
    }
    if (clip) {
      const { name, frameCount, frameRate } = clip.animation;

      showStatus(`${name} · frame ${frame.toFixed(1)} / ${frameCount} · ${frameRate} fps`);
    }
    invalidate();
  };

  const transport = createTransport({
    getLength: () =>
      Math.max(
        clip ? getClipSeconds(clip.animation) : 0,
        ...layers.map((layer) => layer.getLength?.() ?? 0),
      ),
    isBusy: () => layers.some((layer) => layer.isBusy?.()),
    canPlay: () => !!clip || animatesMaterials || layers.length > 0,
    onAdvance: (time) => {
      applyTime();
      layers.forEach((layer) => layer.onAdvance?.(time));
    },
    onSeek: (time) => {
      applyTime();
      layers.forEach((layer) => layer.onSeek?.(time));
    },
    onRestart: () => {
      applyTime();
      layers.forEach((layer) => layer.onRestart?.());
    },
  });
  const picker = createClipPicker((id) => {
    if (!id) {
      clearClip();
      return;
    }
    showStatus(`Loading ${id}…`);
    onPickClip(id);
  });
  const view = createViewControls((text) => {
    showStatus(text);
    parts.refresh();
    invalidate();
  }, skyMemory);
  const boneLabels = createBoneLabels(canvas, () => {
    if (view.choices.showBones) {
      invalidate();
    }
  });
  const parts = createPartsPanel(view.choices, () => rules, partsHint, invalidate);

  const describeClipFit = () =>
    clip && model?.skeleton && !isOwnClip(model.skeleton, clip.animation, clip.skeleton)
      ? describeForeignClip(clip.animation)
      : '';

  const clearClip = (notice = '') => {
    clip = undefined;
    picker.show(undefined);
    clipNotice.textContent = notice;
    showStatus('');
    transport.restart();
  };

  const getCamera = (shake?: number): ViewerCamera => {
    const basis = orbit.getBasis(shake);

    return {
      basis,
      matrix: orbit.getViewProjection(basis, canvas.width / Math.max(1, canvas.height)),
    };
  };

  const fitCanvas = (gl: WebGLRenderingContext) => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };

  const draw = () => {
    if (!graphics) {
      return;
    }

    const { gl, renderer, drawLines } = graphics;
    const { choices } = view;
    const sky = choices.sky;
    const adjustments = layers.map((layer) => layer.prepareFrame?.() ?? {});
    const shake = adjustments.reduce((total, each) => total + (each.shake ?? 0), 0);
    const offset = adjustments.find((each) => each.modelOffset)?.modelOffset;

    fitCanvas(gl);
    gl.clearColor(
      parseInt(sky.slice(1, 3), 16) / 255,
      parseInt(sky.slice(3, 5), 16) / 255,
      parseInt(sky.slice(5, 7), 16) / 255,
      1,
    );
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const camera = getCamera(shake);
    const { basis, matrix } = camera;

    if (choices.showGrid) {
      drawLines(grid, matrix, true);
    }
    renderer.draw(matrix, {
      offset,
      light: basis.forward.map((axis) => -axis) as Vec3,
      showBones: choices.showBones,
      showMeshes: choices.showMeshes,
      lod: choices.lod,
      showHidden: choices.showHidden,
      subObjectRules: rules,
      partOverrides: parts.overrides,
      showBoxes: choices.showBoxes,
      seconds: transport.getMaterialSeconds(),
      camera: {
        eye: basis.eye,
        rotation: [
          basis.right[0], basis.up[0], -basis.forward[0],
          basis.right[1], basis.up[1], -basis.forward[1],
          basis.right[2], basis.up[2], -basis.forward[2],
        ],
      },
    });
    boneLabels.update({
      skeleton: model?.skeleton,
      pose,
      matrix,
      offset,
      showAll: choices.showBoneNames,
      showBones: choices.showBones,
    });
    layers.forEach((layer) => layer.draw?.(camera));
  };

  const hasResized = () => {
    const ratio = window.devicePixelRatio || 1;

    return (
      canvas.width !== Math.round(canvas.clientWidth * ratio) ||
      canvas.height !== Math.round(canvas.clientHeight * ratio)
    );
  };

  const runFrame = (now: number) => {
    if (!canvas.isConnected) {
      return;
    }

    const seconds = Math.min(MAX_FRAME_SECONDS, (now - lastFrame) / 1000);

    lastFrame = now;
    if (transport.isPlaying()) {
      transport.advance(Math.max(0, seconds));
    }
    layers.forEach((layer) => layer.onFrame?.(now));
    if (needsDraw || layers.length || transport.isPlaying() || hasResized()) {
      needsDraw = false;
      draw();
    }
    requestAnimationFrame(runFrame);
  };

  const setModel = (next: ViewerModel | undefined) => {
    model = next;
    graphics?.renderer.setModel(next);
    animatesMaterials = !!next?.meshes.some((mesh) =>
      mesh.draws?.some((each) => isSurfaceAnimated(each.surface)),
    );
    view.setModel(next, rules);
    parts.setModel(next);
    picker.setHasSkeleton(!!next?.skeleton);
    facts.textContent = next ? describeModel(next) : '';
    levelFacts.textContent = next ? describeDetailLevels(next) : '';
    if (clip) {
      clipNotice.textContent = describeClipFit();
    }
    if (next) {
      const [centre, size] = getBoundsSphere(next);

      grid = buildGridLines(size);
      if (!isFramed) {
        isFramed = true;
        orbit.frame(centre, size);
      }
    }
    applyTime();
    transport.refresh();
  };

  window.addEventListener('keydown', (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === ' ') {
      event.preventDefault();
      transport.togglePlaying();
    } else if (key === 'r') {
      transport.restart();
    } else if (key === '.') {
      transport.step();
    } else if (key === 'b') {
      if (model?.skeleton) {
        view.toggleBones();
      }
    } else {
      layers.some((layer) => layer.onKey?.(key));
    }
  });

  transportBar.append(picker.select, ...transport.controls);
  viewBar.append(...view.controls, status);
  main.append(transportBar, viewBar, stage);
  stage.append(canvas, boneLabels.layer);
  side.append(clipNotice, facts, levelFacts, parts.panel, help);
  root.classList.add('viewer');
  root.replaceChildren(main, side);
  if (!graphics) {
    showStatus('This view needs WebGL, which is not available here.');
  }
  view.setModel(undefined, rules);
  transport.refresh();
  requestAnimationFrame(runFrame);

  return {
    canvas,
    gl: graphics?.gl,
    stage,
    side,
    bar: transportBar,
    orbit,
    drawLines: (lines, matrix, depthTest) => graphics?.drawLines(lines, matrix, depthTest),
    addLayer: (layer) => {
      layers.push(layer);
      transport.refresh();
    },
    setModel,
    getModel: () => model,
    getPose: () => pose,
    setClips: (list) => {
      picker.setList(list);
      picker.show(clip?.id);
    },
    playClip: (next) => {
      clip = next;
      picker.show(next.id);
      clipNotice.textContent = describeClipFit();
      transport.restart();
      transport.setPlaying(true);
    },
    clearClip,
    showClipChoice: (id) => picker.show(id),
    setSubObjectRules: (next) => {
      rules = next;
      view.setModel(model, rules);
      parts.refresh();
      invalidate();
    },
    restart: () => transport.restart(),
    getTime: () => transport.getTime(),
    isPlaying: () => transport.isPlaying(),
    showStatus,
    getCamera: () => getCamera(),
  };
};
