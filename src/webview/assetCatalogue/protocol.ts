export interface CatalogueEntryRow {
  name: string;
  kind: string;
  offset: number;
  size: number;
}

export interface CatalogueRecordRow {
  name: string;
  kinds: string;
  entries: CatalogueEntryRow[];
  modified: number;
  bytes: number;
  references: number;
}

export interface CatalogueMessage {
  kind: 'catalogue';
  path: string;
  records: CatalogueRecordRow[];
  dependencies: number;
  error?: string;
  originalTime?: number;
}

export type SyncGroup = 'missing' | 'gone' | 'stale';

export interface SyncRow {
  id: string;
  name: string;
  path?: string;
  origin?: string;
}

export type OriginalState =
  | { kind: 'keepable' }
  | { kind: 'kept'; time: number }
  | { kind: 'none' };

export interface SyncMessage {
  kind: 'sync';
  catalogue: string;
  target: string;
  original: OriginalState;
  groups: Record<SyncGroup, SyncRow[]>;
}

export interface SyncResultMessage {
  kind: 'applied' | 'failed';
  text: string;
}

export type FromAssetCataloguePage =
  | { kind: 'ready' }
  | { kind: 'sync' }
  | { kind: 'restore' }
  | { kind: 'apply'; selected: Record<SyncGroup, string[]>; isKeepingOriginal: boolean }
  | { kind: 'open'; group: SyncGroup; id: string };

export type ToAssetCataloguePage = CatalogueMessage | SyncMessage | SyncResultMessage;
