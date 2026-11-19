import type { Instance } from './instance';

const MAX_SETTLE_TICKS = 60;

export const isMovieSettled = (
  root: Pick<Instance, 'playing' | 'frames'>,
  ticks: number,
): boolean =>
  !root.playing || root.frames.length <= 1 || ticks >= MAX_SETTLE_TICKS;
