export const hotkeyOf = (text: string): string | undefined => {
  for (let index = 0; index < text.length - 1; index++) {
    if (text[index] !== '&') {
      continue;
    }
    if (text[index + 1] === '&') {
      index++;
      continue;
    }
    return text[index + 1].toUpperCase();
  }
  return undefined;
};

export interface KeyedSlot {
  slot: number;
  hotkey?: string;
  grants?: readonly string[];
  needs?: readonly string[];
  needsAny?: boolean;
}

const unlockedBy = (unlocked: KeyedSlot, purchase: KeyedSlot): boolean => {
  const needs = unlocked.needs ?? [];
  const grants = purchase.grants ?? [];

  return (
    needs.length > 0 &&
    grants.length > 0 &&
    (unlocked.needsAny
      ? needs.every((name) => grants.includes(name))
      : needs.some((name) => grants.includes(name)))
  );
};

const canShowTogether = (a: KeyedSlot, b: KeyedSlot): boolean =>
  !unlockedBy(a, b) && !unlockedBy(b, a);

export const hotkeyClashes = (slots: KeyedSlot[]): Map<number, number[]> => {
  const byKey = new Map<string, KeyedSlot[]>();

  for (const keyed of slots) {
    if (keyed.hotkey && keyed.hotkey.trim()) {
      byKey.set(keyed.hotkey, [...(byKey.get(keyed.hotkey) ?? []), keyed]);
    }
  }

  const clashes = new Map<number, number[]>();

  for (const group of byKey.values()) {
    for (const keyed of group) {
      const others = group
        .filter(
          (other) => other.slot !== keyed.slot && canShowTogether(keyed, other),
        )
        .map((other) => other.slot);

      if (others.length) {
        clashes.set(keyed.slot, others);
      }
    }
  }
  return clashes;
};
