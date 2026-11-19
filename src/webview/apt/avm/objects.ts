import type { Instance } from '../instance';
import type { PageMovie } from '../protocol';
import { AsObject } from './value';
import type { Scope, Value } from './value';
import type { Frame, VmState } from './vmState';

export const getClipObject = (vm: VmState, instance: Instance): AsObject => {
  let object = vm.clips.get(instance);

  if (!object) {
    const type = instance.character?.type;

    object = new AsObject(
      type === 'button'
        ? vm.protos.button
        : type === 'editText'
          ? vm.protos.textField
          : vm.protos.movieClip,
      { type: 'clip', instance },
    );
    vm.clips.set(instance, object);
  }
  return object;
};

export const getClipOf = (value: Value): Instance | undefined =>
  value instanceof AsObject && value.kind.type === 'clip'
    ? value.kind.instance
    : undefined;

export const getPrimitiveProto = (
  vm: VmState,
  value: Value,
): AsObject | undefined => {
  switch (typeof value) {
    case 'string':
      return vm.protos.string;
    case 'number':
      return vm.protos.number;
    case 'boolean':
      return vm.protos.boolean;
    default:
      return undefined;
  }
};

export const createArray = (vm: VmState, values: Value[]): AsObject => {
  const array = new AsObject(vm.protos.array, { type: 'array' });

  values.forEach((value, index) => array.set(String(index), value));
  array.define('length', values.length);
  return array;
};

export const createTargetScope = (vm: VmState, clip: Instance): Scope => ({
  values: getClipObject(vm, clip),
  kind: 'target',
  parent: { values: vm.global, kind: 'global' },
});

export const createClipFrame = (
  vm: VmState,
  clip: Instance,
  movie: PageMovie = clip.movie,
): Frame => ({
  movie,
  scope: createTargetScope(vm, clip),
  pool: [],
  self: getClipObject(vm, clip),
  target: clip,
  base: clip,
  stack: [],
  depth: 0,
});
