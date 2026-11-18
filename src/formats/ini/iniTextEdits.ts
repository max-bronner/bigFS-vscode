export interface LineReplacement {
  line: number;
  start: number;
  end: number;
  after: string;
}

export interface LineInsertion {
  line?: number;
  lines: string[];
}

export const lineEndOf = (text: string): string =>
  text.includes('\r\n') ? '\r\n' : '\n';

export const replaceInLines = (
  text: string,
  replacements: readonly LineReplacement[],
): string => {
  const parts = text.split(/(\r\n|\n)/);

  for (const replacement of [...replacements].sort(
    (a, b) => b.line - a.line || b.start - a.start,
  )) {
    const at = replacement.line * 2;
    const line = parts[at];

    if (line !== undefined) {
      parts[at] =
        line.slice(0, replacement.start) +
        replacement.after +
        line.slice(replacement.end);
    }
  }
  return parts.join('');
};

export const insertLines = (
  text: string,
  insertions: readonly LineInsertion[],
): string => {
  const eol = lineEndOf(text);
  const lines = text.split(/\r?\n/);

  for (const insertion of [...insertions]
    .filter((each) => each.line !== undefined)
    .sort((a, b) => b.line! - a.line!)) {
    lines.splice(
      Math.min(insertion.line!, lines.length),
      0,
      ...insertion.lines,
    );
  }

  const appended = insertions
    .filter((each) => each.line === undefined)
    .map((each) => each.lines.join(eol));

  if (!appended.length) {
    return lines.join(eol);
  }
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return (
    lines.join(eol) +
    (lines.length ? eol + eol : '') +
    appended.join(eol + eol) +
    eol
  );
};
