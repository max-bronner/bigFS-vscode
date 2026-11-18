import type { Character, Rect } from '../../formats/apt/aptMovie';
import type { Instance, Player } from './player';
import type { PageMovie } from './protocol';
import { resolve } from './resolve';
import { state } from './state';
import {
  IDENTITY_COLOR,
  concatColor,
  displayList,
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
}

export interface HitArea {
  leaf: Leaf;
  button: Instance;
}

export const placedColor = (child: Instance): ColorTransform => {
  const depth = Number(child.path.split('/').pop());
  const placement =
    child.parent && !child.dynamic && Number.isInteger(depth)
      ? displayList(child.parent.frames, child.parent.frame).find(
          (each) =>
            each.depth === depth &&
            each.born === child.born &&
            each.character === child.placed,
        )
      : undefined;
  const { mult, add } = child.tint ?? placement?.color ?? IDENTITY_COLOR;

  return { mult: [mult[0], mult[1], mult[2], child.alpha], add };
};

export const collect = (
  player: Player,
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
  ): void => {
    const { character } = instance;

    if (instance.visible === false) {
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

    for (const [key, child] of instance.children) {
      const depth = Number(key);
      const childTop = top ?? (instance === player.root ? depth : undefined);

      const emptyClip =
        child.children.size === 0 &&
        ['sprite', 'movie'].includes(child.character?.type ?? '');

      if (child.clipDepth !== undefined && !emptyClip) {
        const area: Leaf[] = [];

        visit(child, place(child), IDENTITY_COLOR, childTop, area, masks);
        open.push({ until: child.clipDepth, leaves: area });
        continue;
      }
      visit(
        child,
        place(child),
        concatColor(color, placedColor(child)),
        childTop,
        out,
        [
        ...masks,
        ...open
          .filter((mask) => Number.isNaN(depth) || depth <= mask.until)
          .map((mask) => mask.leaves),
      ]);
    }
    if (character.type === 'button') {
      for (const hit of instance.hits) {
        const area: Leaf[] = [];

        visit(hit, place(hit), color, top, area);
        hits.push(...area.map((leaf) => ({ leaf, button: instance })));
      }
    }
  };

  visit(player.root, IDENTITY, IDENTITY_COLOR, undefined, leaves);
  return { leaves, hits };
};

export const textureOf = (
  movie: PageMovie,
  id: number,
): HTMLCanvasElement | undefined => {
  const found = resolve(movie, id);

  return found && state.textures.get(found.movie.imageTextures[found.id]);
};

export const localBounds = (leaf: Leaf): Rect => {
  const { character } = leaf;

  if (!character) {
    return UNRESOLVED;
  }
  if ('bounds' in character) {
    return character.bounds;
  }

  const texture = textureOf(leaf.movie, leaf.id);

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
  let box: Rect | undefined = transformRect(leaf.matrix, localBounds(leaf));

  for (const mask of masked ? (leaf.masks ?? []) : []) {
    const area = boundsOf(mask, true);

    box = box && area && intersect(box, area);
  }
  return box;
};

export const boundsOf = (leaves: Leaf[], masked = false): Rect | undefined =>
  union(
    leaves.flatMap((leaf) => {
      const box = leafBounds(leaf, masked);

      return box ? [box] : [];
    }),
  );
