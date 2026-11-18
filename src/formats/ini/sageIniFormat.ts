import type { SageDocument } from './sageIniParser';
import { forEachBlock } from './sageIniParser';

export const formatSageIni = (
  lines: string[],
  parsed: SageDocument,
  unit: string,
): string[] => {
  const depth = new Array<number>(lines.length).fill(0);

  forEachBlock(parsed.blocks, (block) => {
    for (
      let line = block.startLine + 1;
      line < (block.isClosed ? block.endLine : block.endLine + 1);
      line++
    ) {
      depth[line]++;
    }
  });

  const inScript = new Array<boolean>(lines.length).fill(false);

  for (const { startLine, endLine } of parsed.scripts) {
    for (let line = startLine + 1; line < endLine; line++) {
      inScript[line] = true;
    }
  }

  return lines.map((line, index) => {
    if (inScript[index]) {
      return line;
    }

    const text = line.trim();

    return text ? unit.repeat(depth[index]) + text : '';
  });
};

const MAX_PASSES = 8;

export const formatSageIniStable = (
  lines: string[],
  parse: (lines: string[]) => SageDocument,
  unit: string,
): string[] => {
  let current = lines;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = formatSageIni(current, parse(current), unit);

    if (next.every((line, index) => line === current[index])) {
      return current;
    }
    current = next;
  }
  return lines;
};

export const editDistance = (a: string, b: string): number => {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];

    previous[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];

      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return previous[b.length];
};

export const closestNames = (
  name: string,
  candidates: readonly string[],
  limit = 3,
): string[] => {
  const lower = name.toLowerCase();
  const allowed = Math.max(1, Math.min(3, Math.floor(name.length / 3)));

  return candidates
    .map((candidate) => ({
      candidate,
      distance: editDistance(lower, candidate.toLowerCase()),
    }))
    .filter(({ distance }) => distance > 0 && distance <= allowed)
    .sort(
      (a, b) =>
        a.distance - b.distance || a.candidate.localeCompare(b.candidate),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
};

export const missingEndLine = (lines: string[], headerLine: number): number => {
  const indent = (line: string) => line.length - line.trimStart().length;
  const headerIndent = indent(lines[headerLine]);
  let last = headerLine;

  for (let line = headerLine + 1; line < lines.length; line++) {
    const text = lines[line];

    if (
      !text.trim() ||
      text.trim().startsWith(';') ||
      text.trim().startsWith('//')
    ) {
      continue;
    }

    if (indent(text) <= headerIndent) {
      break;
    }

    last = line;
  }

  return last + 1;
};
