import { f32Bits } from '../numbers';

export const sameFloats = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length &&
  a.every((value, index) => f32Bits(value) === f32Bits(b[index]));

export const sameFloat = (a: number | undefined, b: number | undefined) =>
  a === undefined || b === undefined ? a === b : f32Bits(a) === f32Bits(b);
