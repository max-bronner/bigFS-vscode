export interface CreatedObject {
  names: string[];
  offset: [number, number, number];
  count: number;
  requiredUpgrades: string[];
  forbiddenUpgrades: string[];
}

const MAX_NUGGETS = 64;

const readOffset = (values: readonly string[]): [number, number, number] =>
  ['x', 'y', 'z'].map((axis) => {
    const at = values.findIndex((value) => value.toLowerCase().startsWith(`${axis}:`));
    const text = at < 0 ? '' : values[at].slice(2) || values[at + 1];
    const number = Number.parseFloat(text ?? '');

    return Number.isFinite(number) ? number : 0;
  }) as [number, number, number];

export const readObjectCreationList = (lines: readonly string[]): CreatedObject[] => {
  const nuggets: CreatedObject[] = [];
  let depth = 0;
  let nugget: CreatedObject | undefined;

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/(;|\/\/).*/, '').trim();

    if (!line) {
      continue;
    }
    if (/^end$/i.test(line)) {
      if (depth === 0) {
        break;
      }
      if (depth === 1 && nugget) {
        if (nugget.names.length && nuggets.length < MAX_NUGGETS) {
          nuggets.push(nugget);
        }
        nugget = undefined;
      }
      depth--;
      continue;
    }

    const field = /^([^\s=]+)\s*=\s*(.*)$/.exec(line);

    if (!field) {
      depth++;
      if (depth === 1 && /^createobject$/i.test(line)) {
        nugget = { names: [], offset: [0, 0, 0], count: 1, requiredUpgrades: [], forbiddenUpgrades: [] };
      }
      continue;
    }
    if (depth !== 1 || !nugget) {
      continue;
    }

    const key = field[1].toLowerCase();
    const values = field[2].split(/\s+/).filter(Boolean);

    if (key === 'objectnames') {
      nugget.names.push(...values);
    } else if (key === 'offset') {
      nugget.offset = readOffset(values);
    } else if (key === 'count') {
      const count = Number.parseInt(values[0] ?? '', 10);

      nugget.count = Number.isFinite(count) && count >= 0 ? count : 1;
    } else if (key === 'requiredupgrades') {
      nugget.requiredUpgrades.push(...values);
    } else if (key === 'forbiddenupgrades') {
      nugget.forbiddenUpgrades.push(...values);
    }
  }
  return nuggets;
};
