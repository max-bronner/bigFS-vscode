import { BINDINGS, classifySurface } from '../../formats/apt/aptGadgets';
import type { Binding, GadgetInfo } from '../../formats/apt/aptGadgets';
import { toPathKey } from './avm/engine';
import type { Engine } from './avm/engine';
import { parseTyped } from './avm/engine';
import type { Value } from './avm/value';
import { AsObject } from './avm/value';
import type { Instance } from './instance';
import type { Player } from './player';

export interface Gadget extends GadgetInfo {
  instance: Instance;
  path?: string;
}

const text = (value: Value): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const getNamePath = (instance: Instance, root: Instance): string | undefined => {
  const names: string[] = [];

  for (let at: Instance | undefined = instance; at && at !== root; at = at.parent) {
    if (!at.name) {
      return undefined;
    }
    names.unshift(at.name);
  }
  return names.join('.');
};

export const findGadgetOf = (
  player: Player,
  instance: Instance,
): Gadget | undefined => {
  const own = player.vm?.objectOf(instance);
  const info =
    own &&
    classifySurface({
      type: text(own.get('_type')),
      load: text(own.get('_Load')),
      init: text(own.get('_Init')),
      windowId: text(own.get('_WindowId')),
      imageName: text(own.get('_imageName')),
      imageMap: text(own.get('_imageMap')),
      mode: text(own.get('_mode')),
    });

  return info && { ...info, instance, path: getNamePath(instance, player.root) };
};

export const findGadgets = (player: Player): Gadget[] =>
  player.all().flatMap((instance) => {
    const gadget =
      instance.visible === false || instance === player.root
        ? undefined
        : findGadgetOf(player, instance);

    return gadget ? [gadget] : [];
  });

export const isEngineSurface = (player: Player, instance: Instance): boolean =>
  instance.character?.type === 'sprite' &&
  ['image', 'view3d'].includes(findGadgetOf(player, instance)?.kind ?? '');

const show = (value: string | number | boolean): string => String(value);

export const readBinding = (
  player: Player,
  engine: Engine,
  gadget: Gadget,
  binding: Binding,
): Value => {
  const override =
    gadget.path !== undefined
      ? engine.overrides.get(toPathKey(`${gadget.path}.${binding.name}`))
      : undefined;

  if (override !== undefined) {
    return parseTyped(override);
  }

  const held = player.vm?.objectOf(gadget.instance).get(binding.name);

  return held instanceof AsObject || held === undefined ? binding.fallback : held;
};

export const writeBinding = (
  player: Player,
  engine: Engine,
  gadget: Gadget,
  name: string,
  typed: string,
): void => {
  const own = player.vm?.objectOf(gadget.instance);

  if (gadget.path !== undefined) {
    engine.override(`${gadget.path}.${name}`, typed);
  }
  if (!typed.trim()) {
    own?.delete(name);
  } else {
    own?.set(name, parseTyped(typed));
  }
};

export const listBindings = (
  player: Player,
  engine: Engine,
  gadget: Gadget,
): { binding: Binding; value: string; overridden: boolean }[] =>
  BINDINGS[gadget.kind].map((binding) => ({
    binding,
    value: show(
      (readBinding(player, engine, gadget, binding) as string | number | boolean) ??
        binding.fallback,
    ),
    overridden:
      gadget.path !== undefined &&
      engine.overrides.has(toPathKey(`${gadget.path}.${binding.name}`)),
  }));
