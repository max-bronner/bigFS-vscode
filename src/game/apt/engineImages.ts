export const BACKDROP_KEY = 'SetBackground';

export const BACKDROP_CALL = 'FSCommand:SetBackground';

export const BLACK = 'black';

export const NONE = 'none';

export interface EngineImage {
  key: RegExp;
  image: string;
  basis: string;
}

export const ENGINE_IMAGES: readonly EngineImage[] = [
  {
    key: /^MainMenu\.Image$/i,
    image: 'LogoWithShadow',
    basis: 'inferred from retail, as mint binds it',
  },
  {
    key: /^RenderFactionIcon$/i,
    image: 'AptIconMen',
    basis: "inferred: AptIcon plus the player's side",
  },
  {
    key: /(^|\.)Portrait$/i,
    image: BLACK,
    basis: 'inferred: black until something is selected',
  },
  {
    key: new RegExp(`^${BACKDROP_KEY}$`, 'i'),
    image: 'ShellMapLowLOD',
    basis: 'inferred: the shell background with the shell map off',
  },
];

export interface SurfaceNames {
  type?: string;
  imageName?: string;
  imageMap?: string;
}

const isPlainImageType = (type: string | undefined): boolean =>
  /^renderimage(disabled)?$/i.test(type?.trim() ?? '');

export const getSurfaceKey = (
  { type, imageName, imageMap }: SurfaceNames,
  movie: string,
  path: string,
): string =>
  imageMap?.trim() ||
  imageName?.trim() ||
  (type?.trim() && !isPlainImageType(type) ? type.trim() : `${movie}.${path}`);

export const findEngineImage = (key: string): EngineImage | undefined =>
  ENGINE_IMAGES.find((each) => each.key.test(key));

export const drawsGrey = (names: SurfaceNames & { mode?: string }): boolean =>
  /^grayscale$/i.test(names.mode?.trim() ?? '') ||
  /^renderimagedisabled$/i.test(names.type?.trim() ?? '');

export const isTextureFile = (image: string): boolean =>
  /\.(tga|dds|jpe?g)$/i.test(image.trim());
