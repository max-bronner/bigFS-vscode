import type { SageDocument } from '../../formats/ini/sageIniParser';

export interface ArmorCell {
  value: string;
  line: number;
  start: number;
  end: number;
}

export interface ArmorRow {
  name: string;
  uri: string;
  startLine: number;
  endLine: number;
  cells: Record<string, ArmorCell>;
  indent: string;
}

export const readArmorRows = (
  parsed: SageDocument,
  lines: string[],
  uri: string,
): ArmorRow[] =>
  parsed.blocks
    .filter((block) => block.keyword.toLowerCase() === 'armor' && block.name)
    .map((block) => {
      const cells: Record<string, ArmorCell> = {};
      let indent = '  ';

      for (const statement of parsed.statements) {
        if (
          statement.kind !== 'field' ||
          statement.line <= block.startLine ||
          statement.line >= block.endLine ||
          statement.keyword.text.toLowerCase() !== 'armor'
        ) {
          continue;
        }

        const [type, value] = statement.values;

        if (type && value) {
          cells[type.text.toUpperCase()] = {
            value: value.text,
            line: statement.line,
            start: value.start,
            end: value.end,
          };
          indent = /^\s*/.exec(lines[statement.line])![0];
        }
      }
      return {
        name: block.name!.split(/\s+/)[0],
        uri,
        startLine: block.startLine,
        endLine: block.endLine,
        cells,
        indent,
      };
    });

export const damageTypes = (rows: ArmorRow[]): string[] => {
  const types = new Set(rows.flatMap((row) => Object.keys(row.cells)));

  types.delete('DEFAULT');
  return ['DEFAULT', ...[...types].sort()];
};

export interface ArmorShown {
  value: string;
  inherited: boolean;
}

const UNARMORED = '100%';

export const shownArmor = (row: ArmorRow, type: string): ArmorShown => {
  const own = row.cells[type];
  const fallback = row.cells.DEFAULT;

  if (own && (type === 'DEFAULT' || !fallback || own.line > fallback.line)) {
    return { value: own.value, inherited: false };
  }
  return { value: fallback?.value ?? UNARMORED, inherited: true };
};

export type ArmorEdit =
  | { kind: 'replace'; line: number; start: number; end: number; old: string }
  | { kind: 'insert'; line: number; text: string };

export const armorEdit = (
  row: ArmorRow,
  type: string,
  value: string,
  eol = '\n',
): ArmorEdit => {
  const cell = row.cells[type];

  if (cell && !shownArmor(row, type).inherited) {
    return {
      kind: 'replace',
      line: cell.line,
      start: cell.start,
      end: cell.end,
      old: cell.value,
    };
  }
  return {
    kind: 'insert',
    line: type === 'DEFAULT' ? row.startLine + 1 : row.endLine,
    text: `${row.indent}Armor = ${type} ${value}${eol}`,
  };
};

export const armorValue = (typed: string): string | undefined => {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/.exec(typed);

  return match ? `${Number(match[1])}%` : undefined;
};

export interface ArmorTableMessage {
  kind: 'table';
  types: string[];
  rows: ArmorRow[];
}

export type FromArmorPage =
  | { kind: 'ready' }
  | { kind: 'set'; armor: string; type: string; value: string }
  | { kind: 'reveal'; armor: string };
