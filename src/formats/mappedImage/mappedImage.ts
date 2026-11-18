export interface MappedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MappedImage {
  name: string;
  texture?: string;
  textureWidth?: number;
  textureHeight?: number;
  coords?: MappedRect;
  status?: string;
}

export type UvRect = [number, number, number, number];

export const parseMappedImage = (
  name: string,
  lines: readonly string[],
): MappedImage => {
  const fields = new Map<string, string>();

  for (const line of lines) {
    const match = /^\s*(\w+)\s*=\s*([^;]*)/.exec(line);

    if (match) {
      fields.set(match[1].toLowerCase(), match[2].trim());
    }
  }

  const size = (key: string) => {
    const value = Number(fields.get(key));

    return Number.isFinite(value) && value > 0 ? value : undefined;
  };
  const edges = new Map(
    [...(fields.get('coords') ?? '').matchAll(/(\w+)\s*:\s*(-?\d+)/g)].map(
      (match) => [match[1].toLowerCase(), Number(match[2])] as const,
    ),
  );
  const [left, top, right, bottom] = ['left', 'top', 'right', 'bottom'].map(
    (edge) => edges.get(edge),
  );

  return {
    name,
    texture: fields.get('texture') || undefined,
    textureWidth: size('texturewidth'),
    textureHeight: size('textureheight'),
    coords:
      left === undefined ||
      top === undefined ||
      right === undefined ||
      bottom === undefined
        ? undefined
        : { left, top, right, bottom },
    status: fields.get('status') || undefined,
  };
};

export const isRotated = (image: Pick<MappedImage, 'status'>): boolean =>
  /(^|[\s+])ROTATED_90_CLOCKWISE($|[\s+])/i.test(image.status ?? '');

export const mappedUv = (
  image: Pick<MappedImage, 'coords' | 'textureWidth' | 'textureHeight'>,
  decoded: readonly [number, number],
): UvRect => {
  const { coords } = image;

  if (!coords) {
    return [0, 0, 1, 1];
  }

  const width = Math.max(image.textureWidth ?? decoded[0], 1);
  const height = Math.max(image.textureHeight ?? decoded[1], 1);
  const left = coords.left / width;
  const top = coords.top / height;

  return [
    left,
    top,
    Math.max(coords.right / width - left, 0),
    Math.max(coords.bottom / height - top, 0),
  ];
};

export const imageSize = (
  image: Pick<MappedImage, 'coords'>,
): [number, number] | undefined =>
  image.coords && [
    image.coords.right - image.coords.left,
    image.coords.bottom - image.coords.top,
  ];

export const imageExtent = (
  image: Pick<MappedImage, 'coords' | 'status'>,
): [number, number] | undefined => {
  const size = imageSize(image);

  return size && (isRotated(image) ? [size[1], size[0]] : size);
};
