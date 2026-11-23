export type FindDefinitionLines = (
  keyword: 'CommandSet' | 'CommandButton',
  name: string,
) => Promise<readonly string[] | undefined>;

const MAX_BUTTONS = 256;

const readFields = (lines: readonly string[]) => {
  const fields: { key: string; values: string[] }[] = [];

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/(;|\/\/).*/, '').trim();

    if (/^end$/i.test(line)) {
      break;
    }

    const match = /^([^\s=]+)\s*=\s*(.+)$/.exec(line);

    if (match) {
      fields.push({ key: match[1].toLowerCase(), values: match[2].split(/\s+/) });
    }
  }
  return fields;
};

export const readUpgradeNeeds = async (
  commandSets: readonly string[],
  findLines: FindDefinitionLines,
): Promise<Record<string, string[]>> => {
  const buttons = new Set<string>();

  for (const set of new Set(commandSets)) {
    for (const { values } of readFields((await findLines('CommandSet', set)) ?? [])) {
      if (buttons.size < MAX_BUTTONS) {
        buttons.add(values[0]);
      }
    }
  }

  const needs: Record<string, string[]> = Object.create(null);

  for (const button of buttons) {
    const fields = readFields((await findLines('CommandButton', button)) ?? []);
    const read = (key: string) =>
      fields.filter((field) => field.key === key).flatMap((field) => field.values);
    const needed = read('neededupgrade');

    if (!needed.length || /^yes$/i.test(read('neededupgradeany')[0] ?? '')) {
      continue;
    }
    for (const given of read('upgrade')) {
      const key = given.toLowerCase();

      needs[key] = [...new Set([...(needs[key] ?? []), ...needed])];
    }
  }
  return { ...needs };
};
