import { encodeDds, encodeTga } from './textureEncode';
import type { DdsFormat } from './textureEncode';
import type { RgbaImage } from './textureTools';

export type TextureTarget = 'tga32' | 'tga24' | Extract<DdsFormat, 'DXT1' | 'DXT5'>;

export const TEXTURE_TARGETS: readonly {
  target: TextureTarget;
  label: string;
  description: string;
}[] = [
  { target: 'tga32', label: 'TGA 32-bit', description: 'with alpha' },
  { target: 'tga24', label: 'TGA 24-bit', description: 'no alpha' },
  { target: 'DXT1', label: 'DDS DXT1', description: 'no or 1-bit alpha' },
  { target: 'DXT5', label: 'DDS DXT5', description: 'smooth alpha' },
];

export const isDdsTarget = (target: TextureTarget): target is Extract<TextureTarget, DdsFormat> =>
  target !== 'tga32' && target !== 'tga24';

export const getTargetExtension = (target: TextureTarget): 'tga' | 'dds' =>
  isDdsTarget(target) ? 'dds' : 'tga';

export const getOutputName = (name: string, extension: string): string =>
  `${name.replace(/\.[^.]+$/, '')}.${extension}`;

export const hasPowerOfTwoSides = ({ width, height }: { width: number; height: number }): boolean =>
  (width & (width - 1)) === 0 && (height & (height - 1)) === 0;

export const encodeTexture = (
  image: RgbaImage,
  target: TextureTarget,
  mipmaps: boolean,
): Uint8Array =>
  isDdsTarget(target)
    ? encodeDds(image, target, mipmaps)
    : encodeTga(image, target === 'tga32');
