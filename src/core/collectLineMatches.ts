export interface PreviewLine {
  line: number;
  text: string;
  ranges?: [number, number][];
  selection?: [number, number];
}

export interface MatchBlock {
  lines: PreviewLine[];
}

export interface LineMatches {
  blocks: MatchBlock[];
  matchCount: number;
}

const MAX_LINE_LENGTH = 240;

const LEAD_LENGTH = 40;

const findLine = (lineStarts: readonly number[], offset: number): number => {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const middle = (low + high + 1) >> 1;

    if (lineStarts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
};

const clipLine = (
  text: string,
  ranges?: [number, number][],
): Pick<PreviewLine, 'text' | 'ranges'> => {
  if (text.length <= MAX_LINE_LENGTH) {
    return { text, ranges };
  }

  const windowStart = ranges ? Math.max(0, ranges[0][0] - LEAD_LENGTH) : 0;
  const windowEnd = Math.min(text.length, windowStart + MAX_LINE_LENGTH);
  const lead = windowStart > 0 ? '…' : '';
  const tail = windowEnd < text.length ? '…' : '';
  const shift = lead.length - windowStart;

  return {
    text: `${lead}${text.slice(windowStart, windowEnd)}${tail}`,
    ranges: ranges
      ?.filter(([start]) => start < windowEnd)
      .map(([start, end]): [number, number] => [
        Math.max(start, windowStart) + shift,
        Math.min(end, windowEnd) + shift,
      ]),
  };
};

export const collectLineMatches = (
  text: string,
  matches: readonly number[],
  contextLines: number,
): LineMatches => {
  if (!matches.length) {
    return { blocks: [], matchCount: 0 };
  }

  const lineStarts = [0];

  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) {
    lineStarts.push(at + 1);
  }

  const getLineText = (line: number): string => {
    const end =
      line + 1 < lineStarts.length ? lineStarts[line + 1] - 1 : text.length;
    const lineText = text.slice(lineStarts[line], end);

    return lineText.endsWith('\r') ? lineText.slice(0, -1) : lineText;
  };

  const rangesByLine = new Map<number, [number, number][]>();

  for (let at = 0; at < matches.length; at += 2) {
    const line = findLine(lineStarts, matches[at]);
    const start = matches[at] - lineStarts[line];
    const end = Math.min(start + matches[at + 1], getLineText(line).length);
    const ranges = rangesByLine.get(line) ?? [];

    ranges.push([start, Math.max(end, start)]);
    rangesByLine.set(line, ranges);
  }

  const blocks: MatchBlock[] = [];
  let current: PreviewLine[] = [];
  let nextLine = 0;
  let matchCount = 0;

  const pushLine = (line: number, ranges?: [number, number][]): void => {
    const clipped = clipLine(getLineText(line), ranges);

    current.push({
      line,
      ...clipped,
      ...(ranges ? { selection: ranges[0] } : {}),
    });
  };

  const matchedLines = [...rangesByLine];

  for (const [index, [line, ranges]] of matchedLines.entries()) {
    const first = Math.max(0, line - contextLines);

    if (current.length && first > nextLine) {
      blocks.push({ lines: current });
      current = [];
    }

    for (
      let context = Math.max(first, nextLine);
      context < line;
      context += 1
    ) {
      pushLine(context);
    }

    pushLine(line, ranges);
    matchCount += ranges.length;
    nextLine = line + 1;

    const lastContext = Math.min(lineStarts.length - 1, line + contextLines);
    const upcoming = matchedLines[index + 1]?.[0];

    for (
      let context = nextLine;
      context <= lastContext && (upcoming === undefined || context < upcoming);
      context += 1
    ) {
      pushLine(context);
      nextLine = context + 1;
    }
  }

  if (current.length) {
    blocks.push({ lines: current });
  }

  return { blocks, matchCount };
};
