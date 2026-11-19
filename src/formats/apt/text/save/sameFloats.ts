import { toF32Bits } from '../numbers';

export const areSameFloats = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length &&
  a.every((value, index) => toF32Bits(value) === toF32Bits(b[index]));

export const isSameFloat = (a: number | undefined, b: number | undefined) =>
  a === undefined || b === undefined ? a === b : toF32Bits(a) === toF32Bits(b);
