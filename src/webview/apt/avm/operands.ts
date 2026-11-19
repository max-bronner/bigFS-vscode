import { Halt } from './halt';
import { toNumber } from './value';
import type { Value } from './value';
import type { Frame, VmState } from './vmState';

const MAX_STACK = 1024;
const MAX_STRING = 65_536;

export const push = (frame: Frame, value: Value): void => {
  if (frame.stack.length >= MAX_STACK) {
    throw new Halt('the operand stack overflowed');
  }
  frame.stack.push(value);
};

export const pop = (frame: Frame): Value => {
  if (!frame.stack.length) {
    throw new Halt('the operand stack ran out');
  }
  return frame.stack.pop();
};

export const peek = (frame: Frame): Value => {
  if (!frame.stack.length) {
    throw new Halt('the operand stack ran out');
  }
  return frame.stack[frame.stack.length - 1];
};

export const popCount = (frame: Frame): number => {
  const n = toNumber(pop(frame));

  if (!(n >= 0 && n <= 65_536)) {
    throw new Halt('an argument count out of range');
  }
  return Math.trunc(n);
};

export const popArgs = (frame: Frame): Value[] => {
  const count = popCount(frame);

  return Array.from({ length: count }, () => pop(frame));
};

export const readRegister = (
  vm: VmState,
  frame: Frame,
  index: number,
): Value => (frame.registers ?? vm.registers)[index];

export const writeRegister = (
  vm: VmState,
  frame: Frame,
  index: number,
  value: Value,
): void => {
  if (index < 0 || index >= 256) {
    throw new Halt('a register index out of range');
  }
  (frame.registers ?? vm.registers)[index] = value;
};

export const readConstItem = (frame: Frame, index: number): Value => {
  const consts = frame.movie.consts ?? [];

  if (index < 0 || index >= consts.length) {
    throw new Halt(`constant ${index} is not in the .const file`);
  }
  return consts[index];
};

export const readPoolItem = (frame: Frame, index: number): Value => {
  if (index < 0 || index >= frame.pool.length) {
    throw new Halt(`pool entry ${index} was never set`);
  }
  return frame.pool[index];
};

export const concatStrings = (a: string, b: string): string => {
  if (a.length + b.length > MAX_STRING) {
    throw new Halt('a string grew too long');
  }
  return a + b;
};
