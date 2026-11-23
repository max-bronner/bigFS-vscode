import type { AppearanceChange, SubObjectSwitch } from '../../game/objects/partBindings';

export const listOwnChanges = (
  changes: readonly AppearanceChange[],
  kept: readonly AppearanceChange[],
): AppearanceChange[] => {
  const keeps = new Set(
    kept.flatMap((each) => [...(each.take ?? []), ...(each.release ?? [])]).map((name) => name.toLowerCase()),
  );

  return changes.filter(
    (each) =>
      each.give?.length ||
      ![...(each.take ?? []), ...(each.release ?? [])].some((name) => keeps.has(name.toLowerCase())),
  );
};

export const listSwitchChanges = (
  switches: readonly SubObjectSwitch[],
  on: boolean,
): AppearanceChange[] => {
  const changes = switches.flatMap((each) => (on ? each.show : each.hide) ?? []);

  return on ? changes.slice(0, 1) : changes;
};
