import type { ListedEffect } from '../../game/objects/listStateEffects';

const NAMED_BONES = 3;

export interface EffectGroup {
  effects: ListedEffect[];
  detail: string;
}

const NUMBERED = /^(.*?)(\d+)$/;

export const describeBones = (bones: readonly string[]): string => {
  const numbered = bones.map((bone) => NUMBERED.exec(bone));
  const [first] = numbered;

  if (
    bones.length > 1 &&
    first &&
    numbered.every(
      (match, at) =>
        match &&
        match[1].toLowerCase() === first[1].toLowerCase() &&
        match[2].length === first[2].length &&
        Number(match[2]) === Number(first[2]) + at,
    )
  ) {
    return `${bones[0]}–${numbered[numbered.length - 1]![2]}`;
  }
  return bones.length > NAMED_BONES
    ? `${bones.slice(0, NAMED_BONES).join(', ')} and ${bones.length - NAMED_BONES} more`
    : bones.join(', ');
};

const placeBone = (effect: ListedEffect) =>
  effect.bone ? effect.detail.replace(`on ${effect.bone}`, 'on \u0000') : effect.detail;

export const groupEffects = (effects: readonly ListedEffect[]): EffectGroup[] => {
  const groups = new Map<string, ListedEffect[]>();

  for (const effect of effects) {
    const { part, kind, name, frame, bone } = effect;
    const isGroupable = !!bone && placeBone(effect) !== effect.detail;
    const key = isGroupable
      ? [part ?? '', kind, name, frame ?? '', placeBone(effect)].join('|').toLowerCase()
      : `${groups.size}`;
    const members = groups.get(key);

    if (members) {
      members.push(effect);
    } else {
      groups.set(key, [effect]);
    }
  }
  return [...groups.values()].map((members) => ({
    effects: members,
    detail:
      members.length > 1
        ? placeBone(members[0]).replace(
            '\u0000',
            describeBones(members.map((each) => each.bone!)),
          )
        : members[0].detail,
  }));
};
