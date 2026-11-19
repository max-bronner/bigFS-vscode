import type { Matrix2 } from '../aptMovie';
import type { Placement } from './textModel';

const F32 = new Float32Array(1);
const F32_WORD = new Uint32Array(F32.buffer);

export const toF32Bits = (value: number): number => {
  F32[0] = value;
  return F32_WORD[0];
};

export const formatF32 = (value: number): string => {
  if (Number.isNaN(value)) {
    return 'nan';
  }
  if (!Number.isFinite(value)) {
    return value > 0 ? 'inf' : '-inf';
  }
  if (Object.is(value, -0)) {
    return '-0';
  }

  const exact = Math.fround(value);

  for (let digits = 1; digits <= 9; digits++) {
    const text = String(Number(exact.toPrecision(digits)));

    if (Math.fround(Number(text)) === exact) {
      return text;
    }
  }
  return String(exact);
};

export const formatHex = (value: number, digits = 8) =>
  `0x${(value >>> 0).toString(16).padStart(digits, '0')}`;

export const formatByteHex = (value: number) =>
  (value & 255).toString(16).padStart(2, '0');

const turn = (degrees: number): [number, number] => {
  const quarter = degrees / 90;

  if (Number.isInteger(quarter)) {
    return (
      [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as [number, number][]
    )[((quarter % 4) + 4) % 4];
  }

  const radians = (degrees * Math.PI) / 180;

  return [Math.cos(radians), Math.sin(radians)];
};

export const composeMatrix = (
  scaleX: number,
  scaleY: number,
  degrees: number,
): Matrix2 => {
  const [cos, sin] = turn(degrees);

  return [
    Math.fround(scaleX * cos),
    Math.fround(scaleX * sin),
    Math.fround(-scaleY * sin),
    Math.fround(scaleY * cos),
  ];
};

const isSameMatrix = (a: Matrix2, b: Matrix2) =>
  a.every((value, index) => toF32Bits(value) === toF32Bits(b[index]));

const transformWords = (matrix: Matrix2): string[] => {
  const [a, b, c, d] = matrix;

  if (Object.is(b, 0) && Object.is(c, 0)) {
    return toF32Bits(a) === toF32Bits(1) && toF32Bits(d) === toF32Bits(1)
      ? []
      : ['scale', `${formatF32(a)},${formatF32(d)}`];
  }

  const scaleX = Math.hypot(a, b);
  const scaleY = scaleX ? (a * d - b * c) / scaleX : 0;
  const degrees = (Math.atan2(b, a) * 180) / Math.PI;
  const candidates = (value: number, most: number) => [
    ...new Set(
      Array.from({ length: most }, (_, index) =>
        Number(value.toPrecision(index + 1)),
      ),
    ),
  ];

  if (scaleX && Number.isFinite(scaleY) && Number.isFinite(degrees)) {
    const scales = (value: number) => [
      ...new Set(candidates(value, 9).map((each) => formatF32(each))),
    ];
    const read = (text: string) => Math.fround(Number(text));

    for (const x of scales(scaleX)) {
      for (const y of scales(scaleY)) {
        for (const rotation of candidates(degrees, 17)) {
          const degreesText = Object.is(rotation, -0) ? '-0' : String(rotation);

          if (
            isSameMatrix(
              composeMatrix(read(x), read(y), Number(degreesText)),
              matrix,
            )
          ) {
            return [
              ...(toF32Bits(read(x)) === toF32Bits(1) &&
              toF32Bits(read(y)) === toF32Bits(1)
                ? []
                : ['scale', `${x},${y}`]),
              'rot',
              degreesText,
            ];
          }
        }
      }
    }
  }

  return ['matrix', matrix.map(formatF32).join(',')];
};

export const formatPlacementWords = ({ matrix, translate }: Placement): string[] => [
  'at',
  translate.map(formatF32).join(','),
  ...transformWords(matrix),
];
