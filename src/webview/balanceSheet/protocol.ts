import type { StatColumn } from '../../game/objects/objectStats';

export interface SheetCell {
  value: string;
  uri?: string;
  line?: number;
  start?: number;
  end?: number;
  from?: string;
  shared?: number;
  derived?: string;
  written?: string;
}

export interface SheetRow {
  name: string;
  keyword: string;
  parent?: string;
  uri: string;
  line: number;
  selectable: boolean;
  cells: Partial<Record<StatColumn | 'dps', SheetCell>>;
}

export type FromSheetPage =
  | { kind: 'ready' }
  | { kind: 'refresh' }
  | { kind: 'open'; row: string }
  | { kind: 'edit'; row: string; column: string; old: string; value: string };

export type ToSheetPage =
  | { kind: 'loading' }
  | { kind: 'notice'; message: string }
  | { kind: 'rows'; columns: (StatColumn | 'dps')[]; rows: SheetRow[] };
