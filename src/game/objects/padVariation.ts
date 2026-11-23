export interface DefinitionName {
  keyword: string;
  name: string;
}

export interface PadLookup {
  findUsers(
    namespace: 'Object' | 'CommandButton' | 'CommandSet',
    name: string,
  ): Promise<readonly DefinitionName[]>;
  findObjectLines(name: string): Promise<readonly string[] | undefined>;
}

const VARIATION_CONDITIONS: Record<string, string> = {
  '1': 'BUILD_VARIATION_ONE',
  '2': 'BUILD_VARIATION_TWO',
};

const MAX_FOLLOWED = 64;
const MAX_PARENTS = 4;

const isKeyword = (pattern: RegExp) => ({ keyword }: DefinitionName) => pattern.test(keyword);

const readPadBuildVariation = async (
  name: string,
  lookup: PadLookup,
  depth = 0,
): Promise<string | undefined> => {
  const lines = (await lookup.findObjectLines(name)) ?? [];
  let isInFoundation = false;

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/(;|\/\/).*/, '').trim();

    if (/=\s*FoundationAIUpdate\b/i.test(line)) {
      isInFoundation = true;
      continue;
    }
    if (isInFoundation && /^end$/i.test(line)) {
      isInFoundation = false;
      continue;
    }

    const variation = isInFoundation ? /^BuildVariation\s*=\s*(\d+)/i.exec(line) : null;

    if (variation) {
      return variation[1];
    }
  }

  const parent = /^\s*ChildObject\s+\S+\s+(\S+)/i.exec(lines[0] ?? '')?.[1];

  return parent && depth < MAX_PARENTS
    ? readPadBuildVariation(parent, lookup, depth + 1)
    : undefined;
};

export const readPadVariation = async (
  objectName: string,
  lookup: PadLookup,
): Promise<string | undefined> => {
  const buttons = (await lookup.findUsers('Object', objectName))
    .filter(isKeyword(/^commandbutton$/i))
    .slice(0, MAX_FOLLOWED);
  const sets = new Map<string, DefinitionName>();

  for (const button of buttons) {
    for (const set of (await lookup.findUsers('CommandButton', button.name)).filter(isKeyword(/^commandset$/i))) {
      sets.set(set.name.toLowerCase(), set);
    }
  }

  const pads = new Map<string, DefinitionName>();

  for (const set of [...sets.values()].slice(0, MAX_FOLLOWED)) {
    for (const pad of (await lookup.findUsers('CommandSet', set.name)).filter(isKeyword(/^(object|childobject)$/i))) {
      pads.set(pad.name.toLowerCase(), pad);
    }
  }

  const variations = new Set<string | undefined>();

  for (const pad of [...pads.values()].slice(0, MAX_FOLLOWED)) {
    variations.add(await readPadBuildVariation(pad.name, lookup));
  }

  const [only] = variations;

  return variations.size === 1 && only ? VARIATION_CONDITIONS[only] : undefined;
};
