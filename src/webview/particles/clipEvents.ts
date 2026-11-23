export interface EventClip {
  frameRate: number;
  frameCount: number;
}

export const getNextEventStep = (
  frame: number,
  after: number,
  stepRate: number,
  clip: EventClip | undefined,
): number | undefined => {
  const rate = clip && clip.frameRate > 0 ? stepRate / clip.frameRate : 1;
  const first = Math.ceil(frame * rate);

  if (first > after) {
    return first;
  }

  if (!clip || frame >= clip.frameCount) {
    return undefined;
  }

  const loop = Math.max(1, Math.round(clip.frameCount * rate));

  return first + (Math.floor((after - first) / loop) + 1) * loop;
};
