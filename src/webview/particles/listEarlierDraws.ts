import type { ComposedPart } from '../../game/objects/objectComposition';

export const listEarlierDraws = (parts: readonly ComposedPart[]): Map<string, ComposedPart[]> => {
  const byOwner = new Map<string | undefined, ComposedPart[]>();
  const listed = new Map<string, ComposedPart[]>();

  for (const part of parts) {
    const before = byOwner.get(part.parent) ?? [];

    if (part.placement.kind === 'attachBone') {
      listed.set(part.id, [...before]);
    }
    if (part.draw && part.model) {
      before.push(part);
    }
    byOwner.set(part.parent, before);
  }
  return listed;
};
