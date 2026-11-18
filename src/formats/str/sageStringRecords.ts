export interface Span {
  start: number;
  end: number;
}

export interface StringRecord {
  label: string;
  text?: string;
  labelSpan: Span;
  textSpan?: Span;
  span: Span;
  line: number;
  hasEnd: boolean;
  isUnclosed: boolean;
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t' };

export const finishText = (raw: string): string =>
  raw
    .replace(/\\(.)/g, (_, escaped: string) => ESCAPES[escaped] ?? escaped)
    .replace(/ {2,}/g, ' ')
    .replace(/ +(?=[\n\t])/g, '')
    .trim();

export const quoteStringText = (text: string): string =>
  `"${text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')
    .replace(/\t/g, '\\t')}"`;

export const strRecord = (label: string, text: string, eol: string): string =>
  `${label}${eol}${quoteStringText(text)}${eol}END${eol}`;

const closingQuote = (raw: string): number => {
  for (let at = 0; at < raw.length; at++) {
    if (raw[at] === '\\') {
      at += 1;
    } else if (raw[at] === '"') {
      return at;
    }
  }
  return -1;
};

const splitLines = (source: string) => {
  const lines: { text: string; start: number; end: number; next: number }[] =
    [];
  const pattern = /\r?\n/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    lines.push({
      text: source.slice(start, match.index),
      start,
      end: match.index,
      next: match.index + match[0].length,
    });
    start = match.index + match[0].length;
  }

  lines.push({
    text: source.slice(start),
    start,
    end: source.length,
    next: source.length,
  });

  return lines;
};

export const parseStringRecords = (source: string): StringRecord[] => {
  const lines = splitLines(source);
  const records: StringRecord[] = [];
  let index = 0;

  while (index < lines.length) {
    const labelLine = lines[index];
    const label = labelLine.text.trim();
    const line = index;

    index += 1;

    if (!label || label.startsWith('//')) {
      continue;
    }

    const leading = labelLine.text.length - labelLine.text.trimStart().length;
    const record: StringRecord = {
      label,
      labelSpan: {
        start: labelLine.start + leading,
        end: labelLine.start + leading + label.length,
      },
      span: { start: labelLine.start, end: source.length },
      line,
      hasEnd: false,
      isUnclosed: false,
    };

    while (index < lines.length) {
      const current = lines[index];
      const trimmed = current.text.trim();

      if (trimmed.toUpperCase() === 'END') {
        record.hasEnd = true;
        record.span.end = current.next;
        index += 1;
        break;
      }

      if (record.text === undefined && trimmed.startsWith('"')) {
        const open = current.start + current.text.indexOf('"');
        let raw = trimmed.slice(1);
        let close = closingQuote(raw);
        let closeLine = current;
        let closeOffset = close < 0 ? -1 : open + 1 + close;

        while (close < 0 && index + 1 < lines.length) {
          index += 1;
          closeLine = lines[index];

          const before = raw.length + 1;
          const part = closeLine.text.trim();

          raw += ` ${part}`;
          close = closingQuote(raw);

          if (close >= 0) {
            const lead =
              closeLine.text.length - closeLine.text.trimStart().length;

            closeOffset = closeLine.start + lead + (close - before);
          }
        }

        record.isUnclosed = close < 0;
        record.text = finishText(
          (close < 0 ? raw : raw.slice(0, close)).replace(/\s+/g, ' '),
        );
        record.textSpan = {
          start: open,
          end: close < 0 ? closeLine.end : closeOffset + 1,
        };
      }

      index += 1;
    }

    records.push(record);
  }

  return records;
};
