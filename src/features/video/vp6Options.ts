import { OUTPUT_FIELD, createReview } from '../../core/converterDialog';
import type {
  ConverterField,
  ConverterOption,
  ConverterReview,
  ConverterValues,
} from '../../core/converterDialog';
import {
  MAX_GAME_WIDTH,
  MAX_SIDE,
  fitMovieSize,
  getGameWidthWarning,
  validateMovieSize,
} from '../../formats/vp6/encodeMovie';
import { MOVIE_SIZE_PRESETS, describeAspectRatio } from '../../formats/vp6/movieSizes';

export interface MovieSourceSize {
  width: number;
  height: number;
  fps: number;
}

const QUALITIES: ConverterOption[] = [
  { value: '54', label: 'High (larger files)' },
  { value: '42', label: 'Medium' },
  { value: '28', label: 'Low (smallest files)' },
];

const MIN_SIDE = 16;

export interface ResolvedMovieSize {
  width: number;
  height: number;
  oddWidth?: number;
}

export const resolveMovieSize = (
  choice: unknown,
  customWidth: unknown,
  customHeight: unknown,
  source: MovieSourceSize,
): ResolvedMovieSize => {
  let size: [number, number];

  if (choice === 'fit') {
    size = fitMovieSize(source.width, source.height);
  } else if (choice === 'custom') {
    size = [Number(customWidth), Number(customHeight)];
  } else if (typeof choice === 'string' && /^\d+x\d+$/.test(choice)) {
    size = choice.split('x').map(Number) as [number, number];
  } else {
    size = [source.width, source.height];
  }

  const [width, height] = size;

  return Number.isInteger(width) && width % 2
    ? { width: width + 1, height, oddWidth: width }
    : { width, height };
};

const describeSize = (width: number, height: number) =>
  `${width}×${height} (${describeAspectRatio(width, height)})`;

const createSizeOptions = (first: MovieSourceSize, isBatch: boolean): ConverterOption[] => {
  const each = isBatch ? ', each movie its own' : '';
  const [fitWidth, fitHeight] = fitMovieSize(first.width, first.height);

  return [
    {
      value: 'fit',
      label: `Source fitted to the game: ${describeSize(fitWidth, fitHeight)}${each}`,
      group: 'From the source',
    },
    {
      value: 'source',
      label: `Source size: ${describeSize(first.width, first.height)}${each}`,
      group: 'From the source',
    },
    ...MOVIE_SIZE_PRESETS.flatMap(({ aspect, sizes }) =>
      sizes.map(([width, height]) => ({
        value: `${width}x${height}`,
        label: `${width}×${height}${width > MAX_GAME_WIDTH ? ' (wider than the retail games play)' : ''}`,
        group: aspect,
      })),
    ),
    { value: 'custom', label: 'Custom size…', group: 'Other' },
  ];
};

export const createVp6Fields = (first: MovieSourceSize, sourceCount: number): ConverterField[] => {
  const isBatch = sourceCount > 1;

  return [
    { kind: 'select', id: 'size', label: 'Size', options: createSizeOptions(first, isBatch) },
    { kind: 'number', id: 'width', label: 'Width', min: MIN_SIDE, max: MAX_SIDE, step: 2, unit: 'px' },
    { kind: 'number', id: 'height', label: 'Height', min: MIN_SIDE, max: MAX_SIDE, unit: 'px' },
    { kind: 'number', id: 'fps', label: 'Frame rate', min: 1, max: 120, step: 0.001, unit: 'fps' },
    { kind: 'select', id: 'quality', label: 'Quality', options: QUALITIES },
    { kind: 'number', id: 'keySeconds', label: 'Key frame every', min: 0, max: 60, step: 0.5, unit: 's (0: every frame)' },
    OUTPUT_FIELD,
  ];
};

export const getDefaultVp6Values = (first: MovieSourceSize, keySeconds: number): ConverterValues => {
  const [width, height] = fitMovieSize(first.width, first.height);

  return {
    size: 'fit',
    width,
    height,
    fps: Math.round(first.fps * 1000) / 1000,
    quality: '54',
    keySeconds,
    output: 'beside',
  };
};

const reviewSize = (review: ConverterReview, { width, height, oddWidth }: ResolvedMovieSize) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < MIN_SIDE || height < MIN_SIDE) {
    review.errors.push(`A movie is whole pixels, at least ${MIN_SIDE} a side.`);
    return;
  }

  const error = validateMovieSize(width, height);

  if (error) {
    review.errors.push(`${error}.`);
    return;
  }

  const warning = getGameWidthWarning(width);

  if (warning) {
    review.warnings.push(warning);
  }
  if (oddWidth) {
    review.notes.push(`The width ${oddWidth} is rounded up to ${width}, as the game draws a movie of odd width skewed.`);
  }
};

const removeRepeats = (list: string[]) => list.splice(0, list.length, ...new Set(list));

export const reviewVp6Values = (values: ConverterValues, sources: readonly MovieSourceSize[]): ConverterReview => {
  const review = createReview();

  if (values.size !== 'custom') {
    review.hidden.push('width', 'height');
  }
  for (const source of sources) {
    reviewSize(review, resolveMovieSize(values.size, values.width, values.height, source));
  }
  [review.errors, review.warnings, review.notes].forEach(removeRepeats);

  const fps = Number(values.fps);
  const keySeconds = Number(values.keySeconds);

  if (typeof values.fps !== 'number' || !(fps >= 1 && fps <= 120)) {
    review.errors.push('The frame rate is 1 to 120 frames a second.');
  }
  if (typeof values.keySeconds !== 'number' || !(keySeconds >= 0 && keySeconds <= 60)) {
    review.errors.push('Key frames come every 0 to 60 seconds.');
  }
  return review;
};
