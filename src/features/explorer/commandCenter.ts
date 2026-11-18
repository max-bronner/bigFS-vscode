import type { ExtensionContext, TreeView } from 'vscode';
import { registerCommand } from '../../platform/commands';
import { isGameRow, isVirtualNode } from '../../services/archives/explorerRow';
import { toEntryDirectory } from '../../services/archives/gameViewModel';
import type { ExplorerNode } from '../../services/archives/explorerRow';
import type { VirtualNode } from '../../services/archives/virtualNode';

export type NodeCommandRun = (targets: VirtualNode[]) => Promise<void>;

export type RegisterNodeCommand = (id: string, run: NodeCommandRun) => void;

const GAME_FOLDER_COMMANDS = new Set([
  'bigfs.extract',
  'bigfs.overrideInFolder',
]);

export const createNodeCommandRegister = (
  context: ExtensionContext,
  treeView: TreeView<ExplorerNode>,
): RegisterNodeCommand => {
  const getTargets = (
    id: string,
    target?: ExplorerNode,
    selection?: ExplorerNode[],
  ): VirtualNode[] => {
    const rows = selection?.length
      ? selection
      : target
        ? [target]
        : [...treeView.selection];

    return rows.flatMap((row): VirtualNode[] => {
      if (isVirtualNode(row)) {
        return [row];
      }

      if (!isGameRow(row)) {
        return [];
      }

      if (!row.node.children) {
        const ref = row.node.winner?.ref;

        return ref?.kind === 'entry' ? [ref.node] : [];
      }

      const directory = GAME_FOLDER_COMMANDS.has(id)
        ? toEntryDirectory(row.node)
        : undefined;

      return directory ? [directory] : [];
    });
  };

  return (id, run) => {
    const execute = async (
      target?: ExplorerNode,
      selection?: ExplorerNode[],
    ): Promise<void> => {
      const targets = getTargets(id, target, selection);

      if (!targets.length) {
        return;
      }

      await run(targets);
    };

    context.subscriptions.push(registerCommand(id, execute));
  };
};
