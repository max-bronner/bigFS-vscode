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
}

export type SyncGroup = 'missing' | 'gone' | 'stale';

export interface SyncRow {
  id: string;
  name: string;
  path?: string;
  origin?: string;
}

export interface SyncMessage {
  kind: 'sync';
  catalogue: string;
  target: string;
  groups: Record<SyncGroup, SyncRow[]>;
}

export interface SyncResultMessage {
  kind: 'applied' | 'failed';
  text: string;
}

export type FromAssetCataloguePage =
  | { kind: 'ready' }
  | { kind: 'sync' }
  | { kind: 'apply'; selected: Record<SyncGroup, string[]> }
  | { kind: 'open'; group: SyncGroup; id: string };

export type ToAssetCataloguePage = CatalogueMessage | SyncMessage | SyncResultMessage;
