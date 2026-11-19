import type { IniDefinition } from './particleDefinitions';

export type KeyKind = 'Color' | 'Alpha';

export type KeyValue =
  | { rgb: [number, number, number]; frame: number }
  | { min: number; max: number; frame: number };

export interface LineEdit {
  line: number;
  remove: number;
  insert: string[];
}

export const MAX_KEYS = 8;

const keyPattern = (kind: KeyKind) =>
  new RegExp(`^${kind.toLowerCase()}[1-8]$`, 'i');

export const formatKeyLine = (
  kind: KeyKind,
  index: number,
  key: KeyValue,
): string => {
  const frame = Math.max(0, Math.round(key.frame));

  if ('rgb' in key) {
    const [r, g, b] = key.rgb.map((value) =>
      Math.max(0, Math.min(255, Math.round(value))),
    );

    return `${kind}${index + 1} = R:${r} G:${g} B:${b} ${frame}`;
  }
  return `${kind}${index + 1} = ${key.min.toFixed(2)} ${key.max.toFixed(2)} ${frame}`;
};

const indentOf = (line: string | undefined) => /^\s*/.exec(line ?? '')![0];

export const computeKeyEdits = (
  text: string,
  definition: IniDefinition,
  kind: KeyKind,
  keys: KeyValue[],
): LineEdit[] => {
  if (keys.length > MAX_KEYS) {
    throw new Error(`A system holds at most ${MAX_KEYS} ${kind} keys`);
  }

  const lines = text.split(/\r?\n/);
  const pattern = keyPattern(kind);
  const existing = definition.lines.filter((line) =>
    pattern.test(line.keyword.text),
  );
  const written = (indent: string) =>
    keys.map((key, index) => indent + formatKeyLine(kind, index, key));

  if (existing.length) {
    const [first, ...rest] = existing;

    return [
      {
        line: first.line,
        remove: 1,
        insert: written(indentOf(lines[first.line])),
      },
      ...rest.map((line) => ({ line: line.line, remove: 1, insert: [] })),
    ];
  }
  if (!keys.length) {
    return [];
  }
  if (definition.keyword !== 'FXParticleSystem') {
    const indent = indentOf(lines[definition.lines[0]?.line]) || '  ';

    return [{ line: definition.endLine, remove: 0, insert: written(indent) }];
  }

  const module = definition.modules.find(
    (each) => each.slot.toLowerCase() === kind.toLowerCase(),
  );

  if (module) {
    return [
      {
        line: module.line + 1,
        remove: 0,
        insert: written(indentOf(lines[module.line]) + '  '),
      },
    ];
  }

  const indent = indentOf(lines[definition.modules[0]?.line]) || '  ';

  return [
    {
      line: definition.endLine,
      remove: 0,
      insert: [
        `${indent}${kind} = Default${kind}`,
        ...written(indent + '  '),
        `${indent}End`,
      ],
    },
  ];
};

export const applyLineEdits = (text: string, edits: LineEdit[]): string => {
  const newline = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);

  [...edits]
    .sort((a, b) => b.line - a.line)
    .forEach((edit) => lines.splice(edit.line, edit.remove, ...edit.insert));
  return lines.join(newline);
};
