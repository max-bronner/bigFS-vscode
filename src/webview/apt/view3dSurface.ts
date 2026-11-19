import type { Rect } from '../../formats/apt/aptMovie';
import {
  advancePlayback,
  getRestingFrame,
  parsePlayback,
} from '../../formats/apt/aptView3d';
import { isSurfaceAnimated } from '../../formats/w3d/isSurfaceAnimated';
import { poseAt } from '../../formats/w3d/w3dPose';
import { createModelRenderer } from '../shared/modelRenderer';
import type { ModelRenderer } from '../shared/modelRenderer';
import { getVsCodeApi } from '../shared/vscodeApi';
import { engine } from './engineState';
import { readBinding } from './gadgetModel';
import type { Gadget } from './gadgetModel';
import type { FromPage, ToPage } from './protocol';
import { createRenderObjectCache } from './renderObjectCache';
import type { RenderObject } from './renderObjectCache';
import type { SurfacePass } from './surfacePass';
import { paintPlaceholder } from './surfacePlaceholder';
import { findCameraBone, frameModel, lookThroughBone } from './view3dCamera';

const vscode = getVsCodeApi<FromPage>();

const TICKS_PER_SECOND = 30;
const MAX_PICTURE_SIDE = 2048;

interface Picture {
  renderer: ModelRenderer;
  canvas: HTMLCanvasElement;
  shows: string;
  isAnimated: boolean;
}

let arrived: () => void = () => {};
let surface: { canvas: HTMLCanvasElement; gl: WebGLRenderingContext } | null | undefined;
const pictures = new Map<RenderObject, Picture>();
const idle: ModelRenderer[] = [];

const objects = createRenderObjectCache({
  ask: (name) => vscode.postMessage({ kind: 'renderObject', name }),
  release: (object) => {
    const picture = pictures.get(object);

    if (picture) {
      picture.renderer.setModel(undefined);
      idle.push(picture.renderer);
      pictures.delete(object);
    }
  },
});

export const onRenderObjects = (run: () => void): void => {
  arrived = run;
};

export const renderObjectArrived = (
  data: Extract<ToPage, { kind: 'renderObject' }>,
): void => {
  if (data.scene) {
    objects.arrive(data.name, data.scene);
  } else {
    objects.fail(data.name, data.error ?? 'not found');
  }
  arrived();
};

const getSurface = () => {
  if (surface === undefined) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true });

    surface = gl && { canvas, gl };
  }
  return surface;
};

const getPicture = (
  object: RenderObject,
  gl: WebGLRenderingContext,
): Picture => {
  let picture = pictures.get(object);

  if (!picture) {
    picture = {
      renderer: idle.pop() ?? createModelRenderer(gl),
      canvas: document.createElement('canvas'),
      shows: '',
      isAnimated: object.scene.meshes.some((mesh) =>
        mesh.draws?.some((draw) => isSurfaceAnimated(draw.surface)),
      ),
    };
    picture.renderer.setModel(object.scene);
    pictures.set(object, picture);
  }
  return picture;
};

const advance = (
  object: RenderObject,
  gadget: Gadget,
  { player, pass, isPlaying }: SurfacePass,
): number => {
  const read = (name: string, fallback: string | number) =>
    readBinding(player, engine, gadget, { name, fallback });
  const playback = parsePlayback(read('_AnimMode', ''), read('_Frame', 0));
  const { animation } = object.scene;
  const released = object.pass < pass - 1 || player.ticks < object.tick;

  if (animation && pass !== object.pass) {
    const { frameRate, frameCount } = animation;

    if (released) {
      object.frame = 0;
    }
    object.isResting = !isPlaying && (released || object.isResting);
    if (isPlaying) {
      object.frame = advancePlayback(
        playback,
        object.frame,
        released ? 0 : (player.ticks - object.tick) / TICKS_PER_SECOND,
        frameRate,
        frameCount,
      );
    }
  }
  object.tick = player.ticks;
  object.pass = pass;
  return object.isResting && animation
    ? getRestingFrame(playback, object.frame, animation.frameCount)
    : object.frame;
};

const drawPicture = (
  object: RenderObject,
  picture: Picture,
  frame: number,
  seconds: number,
  { canvas, gl }: NonNullable<ReturnType<typeof getSurface>>,
  width: number,
  height: number,
): void => {
  const shows = `${frame}:${width}x${height}${picture.isAnimated ? `@${seconds}` : ''}`;

  if (shows === picture.shows) {
    return;
  }
  canvas.width = picture.canvas.width = width;
  canvas.height = picture.canvas.height = height;
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const { skeleton, animation, bounds } = object.scene;
  const pose = skeleton && poseAt(skeleton, animation, frame);
  const bone = skeleton && pose?.world[findCameraBone(skeleton)];

  picture.renderer.setPose(pose);
  picture.renderer.draw(
    bone ? lookThroughBone(bone, width / height) : frameModel(bounds, width / height),
    { light: [0, 0, 1], unlit: true, showBones: false, seconds },
  );
  picture.canvas.getContext('2d')!.drawImage(canvas, 0, 0);
  picture.shows = shows;
};

export const paintView3d = (
  ctx: CanvasRenderingContext2D,
  gadget: Gadget,
  box: Rect,
  pass: SurfacePass,
): void => {
  const name = String(
    readBinding(pass.player, engine, gadget, {
      name: '_RenderObj',
      fallback: '',
    }) ?? '',
  ).trim();

  if (!name) {
    return;
  }

  const state = objects.get(name, pass.pass);

  if (!('object' in state)) {
    paintPlaceholder(
      ctx,
      box,
      'pending' in state ? `[model ${name}…]` : `[no model ${name}: ${state.unavailable}]`,
    );
    return;
  }

  const shared = getSurface();

  if (!shared) {
    paintPlaceholder(ctx, box, `[model ${name}: no WebGL here]`);
    return;
  }

  const { object } = state;
  const frame = advance(object, gadget, pass);
  const { a, b, c, d } = ctx.getTransform();
  const [left, top, right, bottom] = box;
  const fit = (size: number) =>
    Math.max(1, Math.min(MAX_PICTURE_SIDE, Math.round(size)));
  const picture = getPicture(object, shared.gl);

  drawPicture(
    object,
    picture,
    frame,
    pass.player.ticks / TICKS_PER_SECOND,
    shared,
    fit(Math.hypot(a, b) * (right - left)),
    fit(Math.hypot(c, d) * (bottom - top)),
  );
  ctx.drawImage(picture.canvas, left, top, right - left, bottom - top);
};
