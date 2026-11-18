import { stripComment, tokenize } from '../../formats/ini/sageIniParser';

export interface LineEdit {
  line: number;
  remove: number;
  insert: string[];
}

export const commandSetHeader = (line: string): string | undefined =>
  /^\s*CommandSet\s+([^\s=;/]+)\s*(?:[;]|\/\/|$)/i.exec(line)?.[1];

const slotOf = (line: string) => {
  const [key] = tokenize(stripComment(line));

  return key && /^\d+$/.test(key.text) ? Number(key.text) : undefined;
};

export const slotEdits = (
  lines: string[],
  startLine: number,
  endLine: number,
  slots: ReadonlyMap<number, string>,
): LineEdit[] => {
  const existing: number[] = [];

  for (let line = startLine + 1; line < endLine; line++) {
    if (slotOf(lines[line]) !== undefined) {
      existing.push(line);
    }
  }

  const indent =
    /^\s*/.exec(lines[existing[0] ?? startLine + 1] ?? '')![0] || '  ';
  const written = [...slots]
    .filter(([, button]) => button)
    .sort(([a], [b]) => a - b)
    .map(([slot, button]) => `${indent}${slot} = ${button}`);
  const [first, ...rest] = existing;

  if (first === undefined) {
    return written.length
      ? [{ line: endLine, remove: 0, insert: written }]
      : [];
  }
  return [
    { line: first, remove: 1, insert: written },
    ...rest.map((line) => ({ line, remove: 1, insert: [] })),
  ];
};

export const sameSlots = (
  a: ReadonlyMap<number, string>,
  b: ReadonlyMap<number, string>,
): boolean =>
  a.size === b.size && [...a].every(([slot, button]) => b.get(slot) === button);

export interface EditorSlot {
  slot: number;
  button: string;
  defined: boolean;
  text?: string;
  hotkey?: string;
  clashes?: number[];
  command?: string;
  icon?: string;
}

export interface CommandSetMessage {
  kind: 'set';
  name: string;
  slots: EditorSlot[];
}

export type FromCommandSetPage =
  | { kind: 'ready' }
  | { kind: 'move'; from: number; to: number }
  | { kind: 'clear'; slot: number }
  | { kind: 'add'; slot: number; button?: string }
  | { kind: 'reveal'; slot: number };

export const moveSlot = (
  slots: ReadonlyMap<number, string>,
  from: number,
  to: number,
): Map<number, string> => {
  const next = new Map(slots);
  const moving = slots.get(from);
  const there = slots.get(to);

  if (moving === undefined || from === to) {
    return next;
  }
  next.set(to, moving);
  if (there === undefined) {
    next.delete(from);
  } else {
    next.set(from, there);
  }
  return next;
};
