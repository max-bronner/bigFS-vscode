import {
  BACKDROP_KEY,
  BLACK,
  NONE,
  drawsGrey,
  findEngineImage,
  getSurfaceKey,
} from '../../game/apt/engineImages';
import type { Rect } from '../../formats/apt/aptMovie';
import { engine } from './engineState';
import type { Gadget } from './gadgetModel';
import { getMappedImage } from './mappedSurfaces';
import { getTintedTexture } from './paint';
import { EMPTY_SURFACE } from './scene';
import type { Leaf } from './scene';
import { state } from './state';
import { paintPlaceholder } from './surfacePlaceholder';

export const getImageKey = (gadget: Gadget): string =>
  getSurfaceKey(
    gadget,
    state.movie?.name ?? '',
    gadget.path ?? gadget.instance.path,
  );

const chooseImage = (key: string, own: string): string =>
  engine.imageOverrides.get(key.toLowerCase())?.trim() ||
  findEngineImage(key)?.image ||
  own;

const paintImage = (
  ctx: CanvasRenderingContext2D,
  name: string,
  [left, top, right, bottom]: Rect,
  tint: (texture: HTMLCanvasElement) => HTMLCanvasElement,
  extent?: (size: [number, number]) => [number, number],
): void => {
  if (name.toLowerCase() === NONE) {
    return;
  }
  if (name.toLowerCase() === BLACK) {
    ctx.fillStyle = '#000';
    ctx.fillRect(left, top, right - left, bottom - top);
    return;
  }

  const image = name ? getMappedImage(name) : undefined;
  const texture = image && state.textures.get(image.texture);

  if (!image || !texture) {
    paintPlaceholder(
      ctx,
      [left, top, right, bottom],
      image === null ? `[no MappedImage ${name}]` : `[image ${name || '?'}]`,
    );
    return;
  }

  const [width, height] = extent?.(image.extent) ?? [right - left, bottom - top];
  const [u, v, uw, vh] = image.uv;
  const source: Rect = [
    u * texture.width,
    v * texture.height,
    uw * texture.width,
    vh * texture.height,
  ];
  const shown = tint(texture);

  if (image.rotated) {
    ctx.translate(left, top + height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(shown, source[0], source[1], source[2], source[3], 0, 0, height, width);
  } else {
    ctx.drawImage(shown, source[0], source[1], source[2], source[3], left, top, width, height);
  }
};

export const paintImageSurface = (
  ctx: CanvasRenderingContext2D,
  leaf: Leaf,
  gadget: Gadget,
  box: Rect,
): void => {
  if (drawsGrey(gadget)) {
    ctx.filter = 'grayscale(1)';
  }
  paintImage(
    ctx,
    chooseImage(
      getImageKey(gadget),
      gadget.imageName?.trim() || gadget.imageMap?.trim() || '',
    ),
    box,
    (texture) => getTintedTexture(texture, leaf),
    box === EMPTY_SURFACE ? (size) => size : undefined,
  );
};

export const paintBackdrop = (
  ctx: CanvasRenderingContext2D,
  screen: Rect,
): void => {
  ctx.save();
  paintImage(ctx, chooseImage(BACKDROP_KEY, ''), screen, (texture) => texture);
  ctx.restore();
};
