import type { SageDocument } from '../../formats/ini/sageIniParser';
import { readBlockFields } from './readBlockFields';

export interface LevelRung {
  required: number;
  rank: number;
  upgrades: string[];
}

const MAX_RUNGS = 64;

const MAX_TARGETS = 1024;
const MAX_MACRO_DEPTH = 4;

const listTargets = (
  written: readonly string[],
  resolveMacro: ((name: string) => string | undefined) | undefined,
  depth = 0,
): string[] => {
  const targets: string[] = [];

  for (const name of written) {
    if (targets.length >= MAX_TARGETS) {
      break;
    }

    const value = depth < MAX_MACRO_DEPTH ? resolveMacro?.(name) : undefined;
    const names =
      value === undefined
        ? [name]
        : listTargets(
            value.split(/\s+/, MAX_TARGETS).filter(Boolean),
            resolveMacro,
            depth + 1,
          );

    targets.push(...names.slice(0, MAX_TARGETS - targets.length));
  }
  return targets;
};

const readNumber = (
  text: string | undefined,
  resolveMacro: ((name: string) => string | undefined) | undefined,
) => {
  const value = Number(text);

  return Number.isFinite(value) ? value : Number(text && resolveMacro?.(text)) || 0;
};

export const readLevelTables = (
  documents: readonly SageDocument[],
  resolveMacro?: (name: string) => string | undefined,
): Map<string, LevelRung[]> => {
  const tables = new Map<string, LevelRung[]>();

  for (const parsed of documents) {
    for (const block of parsed.blocks) {
      if (block.keyword.toLowerCase() !== 'experiencelevel') {
        continue;
      }

      const fields = new Map(
        [...readBlockFields(parsed, block)].map(([key, lines]) => [key, lines.flat()]),
      );
      const rung: LevelRung = {
        required: readNumber(fields.get('requiredexperience')?.[0], resolveMacro),
        rank: readNumber(fields.get('rank')?.[0], resolveMacro),
        upgrades: fields.get('upgrades') ?? [],
      };

      for (const target of listTargets(fields.get('targetnames') ?? [], resolveMacro)) {
        const key = target.toLowerCase();
        const table = tables.get(key) ?? [];

        if (table.length < MAX_RUNGS) {
          table.push(rung);
          tables.set(key, table);
        }
      }
    }
  }
  for (const table of tables.values()) {
    table.sort((a, b) => a.required - b.required || a.rank - b.rank);
  }
  return tables;
};
