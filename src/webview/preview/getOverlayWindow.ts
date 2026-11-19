import type { Size } from './getFitScale';

export interface VisibleBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OverlayWindow extends VisibleBox {
  pixelRatio: number;
  bitmapWidth: number;
  bitmapHeight: number;
}

export const MAX_BITMAP_SIDE = 8192;

export const getOverlayWindow = (
  texture: Size,
  visible: VisibleBox,
  devicePixelRatio: number,
): OverlayWindow => {
  const pixelRatio = Math.max(
    1,
    Math.min(devicePixelRatio, MAX_BITMAP_SIDE / 4),
  );
  const room = MAX_BITMAP_SIDE / pixelRatio;
  const left = Math.min(Math.max(0, visible.left), texture.width);
  const top = Math.min(Math.max(0, visible.top), texture.height);
  const width = Math.min(room, Math.max(1, visible.width), texture.width - left);
  const height = Math.min(
    room,
    Math.max(1, visible.height),
    texture.height - top,
  );

  return {
    left,
    top,
    width,
    height,
    pixelRatio,
    bitmapWidth: Math.max(1, Math.ceil(width * pixelRatio)),
    bitmapHeight: Math.max(1, Math.ceil(height * pixelRatio)),
  };
};
