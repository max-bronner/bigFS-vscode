export interface PlayheadMove {
  time: number;
  hasWrapped: boolean;
  hasEnded: boolean;
}

export const advancePlayhead = (
  time: number,
  elapsed: number,
  length: number,
  isBusy: boolean,
  shouldLoop: boolean,
): PlayheadMove => {
  const next = time + elapsed;

  if (!length || next < length || isBusy) {
    return { time: next, hasWrapped: false, hasEnded: false };
  }
  return shouldLoop
    ? { time: 0, hasWrapped: true, hasEnded: false }
    : { time: length, hasWrapped: false, hasEnded: true };
};
