import type { ArchiveSource } from './archiveSource';
import type { VirtualNode } from './virtualNode';
import type { GameViewNode } from './gameViewModel';

export type ExplorerRow = VirtualNode | SourceRow | FolderRow | GameRow;

export interface GameRow {
  readonly kind: 'game';
  readonly node: GameViewNode;
}

export interface SourceRow {
  readonly kind: 'source';
  readonly source: ArchiveSource;
}

export interface FolderRow {
  readonly kind: 'folder';
  readonly sourceId: string;
  readonly path: string;
  readonly name: string;
}

export const isVirtualNode = (element: ExplorerRow): element is VirtualNode =>
  'entryPath' in element;

export const isSourceRow = (element: ExplorerRow): element is SourceRow =>
  !isVirtualNode(element) && element.kind === 'source';

export const isFolderRow = (element: ExplorerRow): element is FolderRow =>
  !isVirtualNode(element) && element.kind === 'folder';

export const isGameRow = (element: ExplorerRow): element is GameRow =>
  !isVirtualNode(element) && element.kind === 'game';
