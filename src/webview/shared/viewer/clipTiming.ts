import type { W3dAnimation } from '../../../formats/w3d/w3dAnimation';

type ClipClock = Pick<W3dAnimation, 'frameCount' | 'frameRate'>;

const getFrameSpan = ({ frameCount }: ClipClock) => Math.max(1, frameCount - 1);

export const getClipSeconds = (clip: ClipClock): number =>
  getFrameSpan(clip) / (clip.frameRate || 1);

export const getClipFrame = (clip: ClipClock, seconds: number): number => {
  const span = getFrameSpan(clip);
  const frames = seconds * (clip.frameRate || 1);
  const frame = frames % span;

  return frames > 0 && frame === 0 ? span : frame;
};
