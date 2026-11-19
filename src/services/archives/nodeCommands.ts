import type { ExtensionContext } from 'vscode';
import { registerCommand } from '../../platform/commands';
import { isGameRow, isVirtualNode } from './explorerRow';
import { toEntryDirectory } from './gameViewModel';
import type { ExplorerRow } from './explorerRow';
import type { ExplorerSelection } from './explorerSelection';
import type { VirtualNode } from './virtualNode';

export type NodeCommandRun = (targets: VirtualNode[]) => Promise<void>;

export type RegisterNodeCommand = (id: string, run: NodeCommandRun) => void;

const GAME_FOLDER_COMMANDS = new Set([
  'bigfs.extract',
  'bigfs.overrideInFolder',
]);

export const createNodeCommandRegistrar = (
  context: ExtensionContext,
  explorerSelection: ExplorerSelection,
): RegisterNodeCommand => {
  const getTargets = (
    id: string,
    target?: ExplorerRow,
    selection?: ExplorerRow[],
  ): VirtualNode[] => {
    const rows = selection?.length
      ? selection
      : target
        ? [target]
        : [...explorerSelection.rows];

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
      target?: ExplorerRow,
      selection?: ExplorerRow[],
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
