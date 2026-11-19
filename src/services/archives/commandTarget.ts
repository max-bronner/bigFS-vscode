import { Uri } from 'vscode';
import type { TreeItem } from 'vscode';
import { getNodeUri } from './nodeAddress';
import { isGameRow, isVirtualNode } from './explorerRow';
import type { ExplorerRow } from './explorerRow';

export type CommandTarget = Uri | TreeItem | ExplorerRow | undefined;

export const toUri = (target: unknown): Uri | undefined => {
  if (!target || typeof target !== 'object') {
    return undefined;
  }
  if (target instanceof Uri) {
    return target;
  }

  const element = target as ExplorerRow;

  if (isVirtualNode(element)) {
    return getNodeUri(element);
  }
  if (isGameRow(element)) {
    const winner = element.node.winner?.ref;

    return winner?.kind === 'entry' ? getNodeUri(winner.node) : winner?.uri;
  }

  return (target as TreeItem).resourceUri;
};
