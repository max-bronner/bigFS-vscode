import type { Character, Rect } from '../../formats/apt/aptMovie';
import type { Instance } from './instance';
import type { PageMovie } from './protocol';
import { resolve } from './resolve';
import { state } from './state';
import {
  IDENTITY_COLOR,
  concatColor,
  buildDisplayList,
  type ColorTransform,
} from './timeline';

export const UNRESOLVED: Rect = [0, 0, 64, 24];

export type Affine = [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

export const multiply = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export const invert = ([a, b, c, d, tx, ty]: Affine): Affine => {
  const det = a * d - b * c;

  if (!det) {
    return IDENTITY;
  }
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * ty - d * tx) / det,
    (b * tx - a * ty) / det,
  ];
};

export const apply = (
  [a, b, c, d, tx, ty]: Affine,
  [x, y]: [number, number],
): [number, number] => [a * x + c * y + tx, b * x + d * y + ty];

export interface Leaf {
  movie: PageMovie;
  id: number;
  character?: Character;
  missing?: string;
  matrix: Affine;
  alpha: number;
  color: ColorTransform;
  instance: Instance;
  top?: number;
  masks?: Leaf[][];
  text?: string;
  surfaceBox?: Rect;
}

export interface HitArea {
  leaf: Leaf;
  target: Instance;
}

export const getPlacedColor = (child: Instance): ColorTransform => {
  const depth = Number(child.path.split('/').pop());
  const placement =
    child.parent && !child.dynamic && Number.isInteger(depth)
      ? buildDisplayList(child.parent.frames, child.parent.frame).find(
          (each) =>
            each.depth === depth &&
            each.born === child.born &&
            each.character === child.placed,
        )
      : undefined;
  const { mult, add } = child.tint ?? placement?.color ?? IDENTITY_COLOR;

  return { mult: [mult[0], mult[1], mult[2], child.alpha], add };
};

export interface DisplayTree {
  readonly root: Instance;
  textOf(instance: Instance): string | undefined;
  takesPointer?(instance: Instance): boolean;
}

export const EMPTY_SURFACE: Rect = [0, 0, 64, 64];

export const collect = (
  player: DisplayTree,
  isEngineSurface?: (instance: Instance) => boolean,
): { leaves: Leaf[]; hits: HitArea[] } => {
  const leaves: Leaf[] = [];
  const hits: HitArea[] = [];

  const visit = (
    instance: Instance,
    matrix: Affine,
    color: ColorTransform,
    top: number | undefined,
    out: Leaf[],
    masks: Leaf[][] = [],
    isMask = false,
  ): void => {
    const { character } = instance;

    if (instance.visible === false && !isMask) {
      return;
    }
    if (
      !character ||
      ['shape', 'image', 'editText', 'text'].includes(character.type)
    ) {
      out.push({
        movie: instance.movie,
        id: instance.id,
        character,
        missing: instance.missing,
        matrix,
        alpha: color.mult[3],
        color,
        instance,
        top,
        ...(masks.length ? { masks } : {}),
        ...(character?.type === 'editText'
          ? { text: player.textOf(instance) }
          : {}),
      });
      return;
    }

    const place = (child: Instance) =>
      multiply(matrix, [...child.matrix, ...child.translate] as Affine);

    const open: { until: number; leaves: Leaf[] }[] = [];
    const firstLeaf = out.length;

    for (const [key, child] of instance.children) {
      const depth = Number(key);
      const childTop = top ?? (instance === player.root ? depth : undefined);

      const emptyClip =
        child.children.size === 0 &&
        ['sprite', 'movie'].includes(child.character?.type ?? '');

      if (child.clipDepth !== undefined && !emptyClip) {
        const area: Leaf[] = [];

        visit(child, place(child), IDENTITY_COLOR, childTop, area, masks, true);
        open.push({ until: child.clipDepth, leaves: area });
        continue;
      }
      visit(
        child,
        place(child),
        concatColor(color, getPlacedColor(child)),
        childTop,
        out,
        [
        ...masks,
        ...open
          .filter((mask) => Number.isNaN(depth) || depth <= mask.until)
          .map((mask) => mask.leaves),
      ]);
    }
    if (!isMask && isEngineSurface?.(instance)) {
      const art = getLeafBounds(out.splice(firstLeaf));

      out.push({
        movie: instance.movie,
        id: instance.id,
        character,
        matrix,
        alpha: color.mult[3],
        color,
        instance,
        top,
        ...(masks.length ? { masks } : {}),
        surfaceBox: art ? transformRect(invert(matrix), art) : EMPTY_SURFACE,
      });
    }
    if (character.type === 'button') {
      for (const hit of instance.hits) {
        const area: Leaf[] = [];

        visit(hit, place(hit), color, top, area, masks);
        hits.push(...area.map((leaf) => ({ leaf, target: instance })));
      }
    } else if (!isMask && player.takesPointer?.(instance)) {
      hits.push(
        ...out.slice(firstLeaf).map((leaf) => ({ leaf, target: instance })),
      );
    }
  };

  visit(player.root, IDENTITY, IDENTITY_COLOR, undefined, leaves);
  return { leaves, hits };
};

export const getImageTexture = (
  movie: PageMovie,
  id: number,
): HTMLCanvasElement | undefined => {
  const found = resolve(movie, id);

  return found && state.textures.get(found.movie.imageTextures[found.id]);
};

export const getLocalBounds = (leaf: Leaf): Rect => {
  const { character, surfaceBox } = leaf;

  if (surfaceBox) {
    return surfaceBox;
  }
  if (!character) {
    return UNRESOLVED;
  }
  if ('bounds' in character) {
    return character.bounds;
  }

  const texture = getImageTexture(leaf.movie, leaf.id);

  return [0, 0, texture?.width ?? 64, texture?.height ?? 64];
};

export const transformRect = (m: Affine, [l, t, r, b]: Rect): Rect => {
  const xs = [l, r, l, r].map(
    (x, i) => m[0] * x + m[2] * [t, t, b, b][i] + m[4],
  );
  const ys = [l, r, l, r].map(
    (x, i) => m[1] * x + m[3] * [t, t, b, b][i] + m[5],
  );

  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

export const union = (boxes: Rect[]): Rect | undefined =>
  boxes.length
    ? [
        Math.min(...boxes.map((box) => box[0])),
        Math.min(...boxes.map((box) => box[1])),
        Math.max(...boxes.map((box) => box[2])),
        Math.max(...boxes.map((box) => box[3])),
      ]
    : undefined;

const intersect = (a: Rect, b: Rect): Rect | undefined => {
  const box: Rect = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3]),
  ];

  return box[0] < box[2] && box[1] < box[3] ? box : undefined;
};

const leafBounds = (leaf: Leaf, masked: boolean): Rect | undefined => {
  let box: Rect | undefined = transformRect(leaf.matrix, getLocalBounds(leaf));

  for (const mask of masked ? (leaf.masks ?? []) : []) {
    const area = getLeafBounds(mask, true);

    box = box && area && intersect(box, area);
  }
  return box;
};

export const getLeafBounds = (leaves: Leaf[], masked = false): Rect | undefined =>
  union(
    leaves.flatMap((leaf) => {
      const box = leafBounds(leaf, masked);

      return box ? [box] : [];
    }),
  );
