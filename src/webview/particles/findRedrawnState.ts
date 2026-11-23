import type { SceneState } from '../../game/objects/objectScene';

const isLike = (a: SceneState, b: SceneState) =>
  a.draw.toLowerCase() === b.draw.toLowerCase() &&
  a.kind === b.kind &&
  a.label.toLowerCase() === b.label.toLowerCase();

export const findRedrawnState = (
  before: readonly SceneState[],
  picked: SceneState,
  after: readonly SceneState[],
): number | undefined => {
  const at = before.indexOf(picked);

  if (at < 0) {
    return undefined;
  }

  const likeBefore = before.slice(0, at).filter((state) => isLike(state, picked)).length;
  let seen = 0;
  const found = after.findIndex((state) => isLike(state, picked) && seen++ === likeBefore);

  if (found >= 0) {
    return found;
  }

  const placed = after[at];

  return placed && placed.draw.toLowerCase() === picked.draw.toLowerCase() && placed.kind === picked.kind
    ? at
    : undefined;
};
