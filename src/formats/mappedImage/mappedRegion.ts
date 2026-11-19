import type { MappedImage, MappedRect } from './mappedImage';

type TextureSize = Pick<MappedImage, 'textureWidth' | 'textureHeight'>;

const getScale = (
  image: TextureSize,
  decoded: readonly [number, number],
): [number, number] => [
  decoded[0] / Math.max(image.textureWidth ?? decoded[0], 1),
  decoded[1] / Math.max(image.textureHeight ?? decoded[1], 1),
];

export const getMappedPixelRect = (
  image: Pick<MappedImage, 'coords' | 'textureWidth' | 'textureHeight'>,
  decoded: readonly [number, number],
): MappedRect | undefined => {
  if (!image.coords) {
    return undefined;
  }

  const [scaleX, scaleY] = getScale(image, decoded);

  return {
    left: image.coords.left * scaleX,
    top: image.coords.top * scaleY,
    right: image.coords.right * scaleX,
    bottom: image.coords.bottom * scaleY,
  };
};

export const getMappedCoords = (
  image: TextureSize,
  decoded: readonly [number, number],
  pixels: MappedRect,
): MappedRect => {
  const [scaleX, scaleY] = getScale(image, decoded);
  const width = Math.max(image.textureWidth ?? decoded[0], 1);
  const height = Math.max(image.textureHeight ?? decoded[1], 1);
  const clamp = (value: number, limit: number) =>
    Math.min(limit, Math.max(0, Math.round(value)));
  const [left, right] = [pixels.left, pixels.right]
    .map((edge) => clamp(edge / scaleX, width))
    .sort((a, b) => a - b);
  const [top, bottom] = [pixels.top, pixels.bottom]
    .map((edge) => clamp(edge / scaleY, height))
    .sort((a, b) => a - b);

  return { left, top, right, bottom };
};
