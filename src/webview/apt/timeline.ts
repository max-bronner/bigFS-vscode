import type { Character, Frame, Matrix2 } from '../../formats/apt/aptMovie';
import type { PageMovie } from './protocol';

export interface ColorTransform {
  mult: [number, number, number, number];
  add: [number, number, number, number];
}

export const IDENTITY_COLOR: ColorTransform = {
  mult: [1, 1, 1, 1],
  add: [0, 0, 0, 0],
};

export const colorFromApt = (mult: number, add = 0): ColorTransform => ({
  mult: [
    (mult & 255) / 255,
    ((mult >>> 8) & 255) / 255,
    ((mult >>> 16) & 255) / 255,
    (mult >>> 24) / 255,
  ],
  add: [
    ((add >>> 16) & 255) / 255,
    ((add >>> 8) & 255) / 255,
    (add & 255) / 255,
    0,
  ],
});

export const concatColor = (
  parent: ColorTransform,
  child: ColorTransform,
): ColorTransform => ({
  mult: parent.mult.map((m, i) => m * child.mult[i]) as ColorTransform['mult'],
  add: parent.add.map(
    (a, i) => a + parent.mult[i] * child.add[i],
  ) as ColorTransform['add'],
});

export const isPlainColor = ({ mult, add }: ColorTransform): boolean =>
  mult[0] === 1 &&
  mult[1] === 1 &&
  mult[2] === 1 &&
  add[0] === 0 &&
  add[1] === 0 &&
  add[2] === 0;

export interface Placement {
  depth: number;
  character: number;
  matrix: Matrix2;
  translate: [number, number];
  alpha: number;
  color: ColorTransform;
  name?: string;
  born: number;
  placedItem: number;
  matrixItem: number;
  clipDepth?: number;
  clipActions?: { events: number; block: number }[];
}

export const framesOf = (movie: PageMovie, character: Character): Frame[] =>
  character.type === 'movie'
    ? movie.frames
    : character.type === 'sprite'
      ? (movie.spriteFrames[character.id] ?? [])
      : [];

const built = new WeakMap<Frame[], Map<number, Placement[]>>();

export const displayList = (frames: Frame[], frame: number): Placement[] => {
  let cache = built.get(frames);
  const known = cache?.get(frame);

  if (known) {
    return known;
  }

  type Entry = Omit<Placement, 'depth' | 'character'> & { character?: number };
  const list = new Map<number, Entry>();

  for (let index = 0; index <= frame && index < frames.length; index++) {
    for (const item of frames[index].items) {
      if (item.type === 'removeObject') {
        list.delete(item.depth);
      } else if (item.type === 'placeObject') {
        const existing = list.get(item.depth);
        const replaces =
          item.character !== undefined &&
          item.character !== existing?.character;
        const isNew = !(item.flags & 1) || !existing;
        const next: Entry = isNew
          ? {
              matrix: [1, 0, 0, 1],
              translate: [0, 0],
              alpha: 1,
              color: IDENTITY_COLOR,
              born: index,
              placedItem: item.offset,
              matrixItem: item.offset,
            }
          : {
              ...existing,
              born: replaces ? index : existing.born,
              placedItem: replaces ? item.offset : existing.placedItem,
            };

        if (item.character !== undefined) {
          next.character = item.character;
        }
        if (item.matrix) {
          next.matrix = item.matrix;
          next.translate = item.translate ?? [0, 0];
          next.matrixItem = item.offset;
        }
        if (item.colorTransform !== undefined) {
          next.color = colorFromApt(item.colorTransform, item.colorAdd);
          next.alpha = next.color.mult[3];
        }
        if (item.name !== undefined) {
          next.name = item.name;
        }
        if (item.clipDepth !== undefined) {
          next.clipDepth = item.clipDepth;
        }
        if (item.clipActions) {
          next.clipActions = item.clipActions;
        }
        if (next.character !== undefined) {
          list.set(item.depth, next);
        }
      }
    }
  }

  const placements = [...list.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([depth, placement]) => ({
      depth,
      ...placement,
      character: placement.character!,
    }));

  if (!cache) {
    cache = new Map();
    built.set(frames, cache);
  }
  cache.set(frame, placements);
  return placements;
};
