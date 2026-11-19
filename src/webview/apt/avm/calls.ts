import { getMember, getTargetPath } from './displayObjects';
import { execute } from './execution';
import { Halt } from './halt';
import { createArray, getClipObject, getClipOf } from './objects';
import { AsObject, formatNumber, toBoolean, toInt32 } from './value';
import type { BytecodeFunction, Value } from './value';
import type { Frame, VmState } from './vmState';

const MAX_CALL_DEPTH = 64;

const PRELOAD = {
  this: 0x01,
  suppressThis: 0x02,
  arguments: 0x04,
  suppressArguments: 0x08,
  super: 0x10,
  root: 0x40,
  parent: 0x80,
  global: 0x100,
};

export const toAvmString = (vm: VmState, value: Value): string => {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return formatNumber(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  switch (value.kind.type) {
    case 'clip':
      return getTargetPath(value.kind.instance, '.');
    case 'function':
    case 'native':
      return '[type Function]';
    case 'array':
      return joinArray(vm, value, ',');
    default: {
      const toString = getMember(vm, value, 'toString');

      return toString instanceof AsObject &&
        toString !== vm.protos.object.get('toString')
        ? toAvmString(vm, callValue(vm, toString, value, [], 'toString'))
        : '[object Object]';
    }
  }
};

export const joinArray = (
  vm: VmState,
  array: AsObject,
  separator: string,
): string => {
  const length = Math.min(100_000, Math.max(0, toInt32(array.get('length'))));
  const parts: string[] = [];

  for (let index = 0; index < length; index++) {
    const value = array.get(String(index));

    parts.push(
      value === undefined || value === null || value === array
        ? ''
        : toAvmString(vm, value),
    );
  }
  return parts.join(separator);
};

const callBytecode = (
  vm: VmState,
  callee: AsObject,
  fn: BytecodeFunction,
  self: Value,
  args: Value[],
  caller?: Frame,
): Value => {
  const depth = (caller?.depth ?? 0) + 1;

  if (depth > MAX_CALL_DEPTH) {
    throw new Halt('calls nest too deep');
  }

  const def = fn.def;
  const selfClip = getClipOf(self);
  const base = fn.base ?? selfClip;
  const locals = new AsObject();
  const frame: Frame = {
    movie: fn.movie,
    scope: { values: locals, kind: 'local', parent: fn.scope },
    pool: fn.pool,
    self,
    base,
    target: base,
    stack: [],
    depth,
  };
  const argumentsArray = createArray(vm, args);

  argumentsArray.define('callee', callee);
  if (def.isVersion2) {
    const flags = def.flags >>> 16;
    const registers: Value[] = [undefined];
    const preload = (bit: number, value: () => Value) => {
      if (flags & bit) {
        registers.push(value());
      }
    };

    preload(PRELOAD.this, () =>
      flags & PRELOAD.suppressThis ? undefined : self,
    );
    if (flags & PRELOAD.arguments) {
      registers.push(argumentsArray);
    } else if (!(flags & PRELOAD.suppressArguments)) {
      locals.set('arguments', argumentsArray);
    }
    preload(PRELOAD.super, () => undefined);
    preload(PRELOAD.root, () => getClipObject(vm, vm.stage.root));
    if (flags & PRELOAD.parent && base?.parent) {
      registers.push(getClipObject(vm, base.parent));
    }
    preload(PRELOAD.global, () => vm.global);
    def.params.forEach((param, at) => {
      if (param.register > 0 && param.register < 256) {
        registers[param.register] = args[at];
      } else {
        locals.set(param.name, args[at]);
      }
    });
    frame.registers = registers;
  } else {
    locals.set('arguments', argumentsArray);
    def.params.forEach((param, at) => locals.set(param.name, args[at]));
  }

  const result = execute(vm, def.body, frame);

  return result.returned ? result.value : undefined;
};

export const callValue = (
  vm: VmState,
  callee: Value,
  self: Value,
  args: Value[],
  name: string,
): Value => {
  if (callee instanceof AsObject && callee.kind.type === 'function') {
    return callBytecode(vm, callee, callee.kind.fn, self, args);
  }
  if (callee instanceof AsObject && callee.kind.type === 'native') {
    return callee.kind.call(vm, self, args);
  }

  const texts = args.map((arg) => toAvmString(vm, arg));
  const lower = name.toLowerCase();

  if (lower === 'getextern') {
    return vm.engine.extern(texts[0] ?? '');
  }
  if (lower === 'toggleextern') {
    const key = texts[0] ?? '';

    vm.engine.setExtern(key, !toBoolean(vm.engine.extern(key)));
    return undefined;
  }
  return vm.engine.call(name, texts);
};

export const callFromFrame = (
  vm: VmState,
  frame: Frame,
  callee: Value,
  self: Value,
  args: Value[],
  name: string,
): Value => {
  if (callee instanceof AsObject && callee.kind.type === 'function') {
    return callBytecode(vm, callee, callee.kind.fn, self, args, frame);
  }
  return callValue(vm, callee, self, args, name);
};
