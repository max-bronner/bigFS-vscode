import { pushLine } from './pushLine';
import type { LineColor } from './pushLine';

const BASE_HALF_WIDTH = 200;
const SQUARES = 10;
const COLOR: LineColor = [1, 1, 1, 0.12];
const AXIS_SQUARES = 2;

export const buildGridLines = (radius: number): number[] => {
  const out: number[] = [];
  let half = BASE_HALF_WIDTH;

  while (half < radius * 1.5 && half < Number.MAX_SAFE_INTEGER) {
    half *= 2;
  }
  for (let square = -SQUARES; square <= SQUARES; square++) {
    const at = (square * half) / SQUARES;

    pushLine(out, [at, -half, 0], [at, half, 0], COLOR);
    pushLine(out, [-half, at, 0], [half, at, 0], COLOR);
  }

  const axis = (AXIS_SQUARES * half) / SQUARES;

  pushLine(out, [0, 0, 0], [axis, 0, 0], [1, 0.3, 0.3, 0.8]);
  pushLine(out, [0, 0, 0], [0, axis, 0], [0.3, 1, 0.3, 0.8]);
  pushLine(out, [0, 0, 0], [0, 0, axis], [0.4, 0.6, 1, 0.8]);
  return out;
};
