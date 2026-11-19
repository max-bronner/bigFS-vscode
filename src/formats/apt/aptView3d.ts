import { toNumberOr } from './aptGadgets';

export type Playback =
  | { mode: 'hold' | 'playTo'; frame: number }
  | { mode: 'loop' };

export const parsePlayback = (mode: unknown, frame: unknown): Playback => {
  const name = String(mode ?? '').toUpperCase();

  return name === 'LOOP'
    ? { mode: 'loop' }
    : {
        mode: name === 'PLAY_TO_FRAME' ? 'playTo' : 'hold',
        frame: toNumberOr(frame, 0),
      };
};

export const advancePlayback = (
  playback: Playback,
  current: number,
  seconds: number,
  rate: number,
  frames: number,
): number => {
  const last = Math.max(0, frames - 1);
  const step = Math.max(0, seconds * rate);

  if (playback.mode === 'loop') {
    return last > 0 ? (current + step) % (last + 1) : 0;
  }

  const target = Math.max(0, Math.min(last, playback.frame));

  if (playback.mode === 'hold') {
    return target;
  }
  return current < target
    ? Math.min(target, current + step)
    : Math.max(target, current - step);
};

export const getRestingFrame = (
  playback: Playback,
  current: number,
  frames: number,
): number =>
  playback.mode === 'loop'
    ? current
    : advancePlayback(playback, current, Infinity, 1, frames);

export const toRenderObjectFile = (name: string): string | undefined => {
  const stem = name.trim().replace(/\.w3d$/i, '');

  return stem && !/[\\/:]|\.\./.test(stem) ? `${stem}.w3d` : undefined;
};
