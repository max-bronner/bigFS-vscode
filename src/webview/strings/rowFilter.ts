import type { StringRow } from './protocol';

export const ROWS_PER_PAGE = 200;

export const matchesFilter = (row: StringRow, text: string): boolean =>
  !text ||
  row.label.toLowerCase().includes(text) ||
  row.text.toLowerCase().includes(text) ||
  (row.speech ?? '').toLowerCase().includes(text);

export const filterRows = (
  rows: readonly StringRow[],
  filter: string,
): StringRow[] => {
  const text = filter.toLowerCase();

  return rows.filter((row) => matchesFilter(row, text));
};

export const describeCount = (visible: number, total: number): string =>
  visible === total ? `${total} labels` : `${visible} of ${total} labels`;
