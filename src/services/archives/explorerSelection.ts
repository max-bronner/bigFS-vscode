import type { TreeView } from 'vscode';
import type { ExplorerRow } from './explorerRow';

export interface ExplorerSelection {
  readonly rows: readonly ExplorerRow[];
  attach(treeView: TreeView<ExplorerRow>): void;
}

export const createExplorerSelection = (): ExplorerSelection => {
  let treeView: TreeView<ExplorerRow> | undefined;

  return {
    get rows() {
      return treeView?.selection ?? [];
    },
    attach: (view) => {
      treeView = view;
    },
  };
};
