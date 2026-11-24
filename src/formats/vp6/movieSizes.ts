export const MOVIE_SIZE_PRESETS: readonly {
  aspect: string;
  sizes: readonly (readonly [number, number])[];
}[] = [
  {
    aspect: '16:9',
    sizes: [
      [640, 360],
      [854, 480],
      [960, 540],
      [1024, 576],
      [1280, 720],
      [1920, 1080],
    ],
  },
  {
    aspect: '4:3',
    sizes: [
      [640, 480],
      [800, 600],
      [1024, 768],
    ],
  },
  {
    aspect: '16:10',
    sizes: [
      [1024, 640],
      [1280, 800],
      [1920, 1200],
    ],
  },
];

const NAMED_RATIOS: readonly [string, number][] = [
  ['16:9', 16 / 9],
  ['4:3', 4 / 3],
  ['16:10', 16 / 10],
  ['3:2', 3 / 2],
  ['5:4', 5 / 4],
  ['1:1', 1],
  ['21:9', 64 / 27],
];

export const describeAspectRatio = (width: number, height: number): string => {
  const ratio = width / height;
  const named = NAMED_RATIOS.find(
    ([, value]) => Math.abs(ratio / value - 1) < 0.01,
  );

  return named ? named[0] : `${ratio.toFixed(2)}:1`;
};
