import type { ArchiveSource } from './archiveSource';
import type { VirtualNode } from './virtualNode';
import type { GameViewNode } from './gameViewModel';

export type ExplorerNode = VirtualNode | SourceNode | FolderNode | GameRow;

export interface GameRow {
  readonly kind: 'game';
  readonly node: GameViewNode;
}

export interface SourceNode {
  readonly kind: 'source';
  readonly source: ArchiveSource;
}

export interface FolderNode {
  readonly kind: 'folder';
  readonly sourceId: string;
  readonly path: string;
  readonly name: string;
}

export const isVirtualNode = (element: ExplorerNode): element is VirtualNode =>
  'entryPath' in element;

export const isSourceNode = (element: ExplorerNode): element is SourceNode =>
  !isVirtualNode(element) && element.kind === 'source';

export const isFolderNode = (element: ExplorerNode): element is FolderNode =>
  !isVirtualNode(element) && element.kind === 'folder';

export const isGameRow = (element: ExplorerNode): element is GameRow =>
  !isVirtualNode(element) && element.kind === 'game';
