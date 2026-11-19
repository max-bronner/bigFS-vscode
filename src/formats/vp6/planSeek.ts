export interface SeekFrame {
  isKey: boolean;
  alpha?: Uint8Array;
  isAlphaKey?: boolean;
}

export interface SeekRestart {
  start: number;
  colourFrom: number;
  alphaFrom: number;
}

const FORWARD_LIMIT = 60;

export const planSeek = (
  frames: readonly SeekFrame[],
  hasAlpha: boolean,
  next: number,
  target: number,
): SeekRestart | undefined => {
  if (target >= next && target - next <= FORWARD_LIMIT) {
    return undefined;
  }

  let colourFrom = target;

  while (colourFrom > 0 && !frames[colourFrom].isKey) {
    colourFrom--;
  }

  let alphaFrom = hasAlpha ? target : colourFrom;

  while (
    hasAlpha &&
    alphaFrom > 0 &&
    !(frames[alphaFrom].alpha && frames[alphaFrom].isAlphaKey)
  ) {
    alphaFrom--;
  }

  const start = Math.min(colourFrom, alphaFrom);

  return start >= next || target < next
    ? { start, colourFrom, alphaFrom }
    : undefined;
};
