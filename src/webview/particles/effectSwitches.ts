import type { ListedEffect } from '../../game/objects/listStateEffects';

export interface EffectSwitches {
  list(playing: readonly ListedEffect[], others: readonly ListedEffect[], asked?: string): void;
  isOn(effect: ListedEffect): boolean;
  pick(effect: ListedEffect, on: boolean): void;
  getOn(): ListedEffect[];
}

const getKey = ({ kind, name, bone, frame, part }: ListedEffect) =>
  `${part ?? ''}|${kind}|${name}|${bone ?? ''}|${frame ?? ''}`.toLowerCase();

export const createEffectSwitches = (): EffectSwitches => {
  const picked = new Map<string, boolean>();
  const defaults = new Map<ListedEffect, boolean>();
  let lastAsked: string | undefined;

  const isOn = (effect: ListedEffect) =>
    picked.get(getKey(effect)) ?? defaults.get(effect) ?? false;

  return {
    isOn,
    list: (playing, others, asked) => {
      const name = asked?.toLowerCase();

      if (name && name !== lastAsked) {
        picked.clear();
        lastAsked = name;
      }
      defaults.clear();
      for (const effect of playing) {
        defaults.set(effect, !name || effect.name.toLowerCase() === name);
      }
      for (const effect of others) {
        defaults.set(effect, effect.name.toLowerCase() === name);
      }
    },
    pick: (effect, on) => {
      picked.set(getKey(effect), on);
    },
    getOn: () => [...defaults.keys()].filter(isOn),
  };
};
