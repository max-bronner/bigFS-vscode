import type { SyncRow } from './protocol';

export interface SyncRowOrigin {
  origin: string;
  rows: SyncRow[];
}

export const groupSyncRows = (rows: readonly SyncRow[]): SyncRowOrigin[] => {
  const groups = new Map<string, SyncRow[]>();

  for (const row of rows) {
    const origin = row.origin ?? '';
    const members = groups.get(origin);

    if (members) {
      members.push(row);
    } else {
      groups.set(origin, [row]);
    }
  }
  return [...groups].map(([origin, members]) => ({ origin, rows: members }));
};
