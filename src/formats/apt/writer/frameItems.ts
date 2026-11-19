import type { AptMovie } from '../aptMovie';
import { AptImage } from './aptImage';

export const getTimelineFields = (
  movie: AptMovie,
  timeline: number,
): { countAt: number; pointerAt: number } => {
  const character = movie.characters[timeline];

  if (character?.type === 'movie' || character?.type === 'sprite') {
    return { countAt: character.offset + 8, pointerAt: character.offset + 12 };
  }

  throw new Error(`#${timeline} has no timeline`);
};

export const addFrameItem = (
  image: AptImage,
  movie: AptMovie,
  timeline: number,
  frame: number,
  record: number[],
): void => {
  const { countAt, pointerAt } = getTimelineFields(movie, timeline);
  const frameCount = image.u32(countAt);

  if (frame < 0 || frame >= frameCount) {
    throw new Error(`#${timeline} has no frame ${frame}`);
  }

  const frameAt = image.u32(pointerAt) + frame * 8;
  const itemCount = image.u32(frameAt);
  const items = image.growArray(frameAt + 4, itemCount, 1);

  image.setU32(items + itemCount * 4, image.appendWords(record));
  image.setU32(frameAt, itemCount + 1);
};

export const expectItem = (
  image: AptImage,
  offset: number,
  type: number,
  name: string,
): void => {
  if (image.u32(offset) !== type) {
    throw new Error(`No ${name} at ${offset}`);
  }
};
