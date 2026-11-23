import { describePartSource, getPartGroupKey } from './objectComposition';
import type { ComposedPart } from './objectComposition';

export interface PartGroup {
  key: string;
  parent?: string;
  name: string;
  source: string;
  parts: ComposedPart[];
}

export const groupComposedParts = (parts: readonly ComposedPart[]): PartGroup[] => {
  const groups = new Map<string, PartGroup>();
  const groupOfPart = new Map<string, string>();

  for (const part of parts) {
    const parent = part.parent === undefined ? undefined : groupOfPart.get(part.parent);
    const name = part.object ?? part.draw ?? part.model ?? part.id;
    const source = describePartSource(part);
    const key = getPartGroupKey(parent, name, source);
    let group = groups.get(key);

    if (!group) {
      group = { key, parent, name, source, parts: [] };
      groups.set(key, group);
    }
    group.parts.push(part);
    groupOfPart.set(part.id, key);
  }
  return [...groups.values()];
};
