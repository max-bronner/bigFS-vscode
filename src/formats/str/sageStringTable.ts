import { parseStringRecords } from './sageStringRecords';

export interface SageString {
  label: string;
  text: string;
  line: number;
}

export const parseStringTable = (source: string): Map<string, SageString> => {
  const strings = new Map<string, SageString>();

  for (const record of parseStringRecords(source)) {
    const key = record.label.toLowerCase();

    if (record.text !== undefined && !strings.has(key)) {
      strings.set(key, {
        label: record.label,
        text: record.text,
        line: record.line,
      });
    }
  }

  return strings;
};

export const findString = (
  strings: ReadonlyMap<string, SageString>,
  value: string,
): SageString | undefined => {
  const key = value.toLowerCase();

  if (key.startsWith('$')) {
    return strings.get(`apt:${key.slice(1)}`) ?? strings.get(key.slice(1));
  }

  return strings.get(key);
};
