import { env } from 'vscode';
import { setContextKey } from '../../platform/contextKeys';
import {
  copyNodes,
  getTargetDirectory,
  transferNodes,
} from './fileActions';
import { getTopLevelNodes } from '../../services/archives/virtualNode';
import type { RegisterNodeCommand } from './commandCenter';
import type { VirtualNode } from '../../services/archives/virtualNode';
import type { ArchiveModel } from '../../services/archives/archiveModel';

type ClipboardOperation = 'cut' | 'copy';

interface ClipboardContent {
  nodes: VirtualNode[];
  operation: ClipboardOperation;
}

export const registerClipboardCommands = (
  register: RegisterNodeCommand,
  archiveModel: ArchiveModel,
): void => {
  let clipboard: ClipboardContent | undefined;

  const getEntryPath = (node: VirtualNode): string =>
    node.entryPath.replace(/\//g, '\\');

  const getAbsolutePath = (node: VirtualNode): string =>
    `${node.archive.archivePath}\\${getEntryPath(node)}`;

  const setClipboard = async (
    content: ClipboardContent | undefined,
  ): Promise<void> => {
    clipboard = content;

    await setContextKey('hasClipboard', Boolean(content));
  };

  const paste = async (target: VirtualNode): Promise<void> => {
    const directory = getTargetDirectory(target);

    if (!clipboard || !directory) {
      return;
    }

    const { nodes, operation } = clipboard;
    const { transferred, moved } = await transferNodes(
      archiveModel,
      nodes,
      directory,
      operation === 'cut' ? 'move' : 'copy',
    );

    if (transferred && moved) {
      await setClipboard(undefined);
    }
  };

  const duplicate = async (nodes: readonly VirtualNode[]): Promise<void> => {
    const siblingsByDirectory = new Map<VirtualNode, VirtualNode[]>();

    for (const node of getTopLevelNodes(nodes)) {
      const directory = node.parent;

      if (!directory) {
        continue;
      }

      const siblings = siblingsByDirectory.get(directory) ?? [];

      siblings.push(node);
      siblingsByDirectory.set(directory, siblings);
    }

    for (const [directory, siblings] of siblingsByDirectory) {
      await copyNodes(archiveModel, siblings, directory);
    }
  };

  register('bigfs.cut', async (targets) => {
    await setClipboard({ nodes: [...targets], operation: 'cut' });
  });

  register('bigfs.copy', async (targets) => {
    await setClipboard({ nodes: [...targets], operation: 'copy' });
  });

  register('bigfs.paste', ([target]) => paste(target));
  register('bigfs.duplicate', (targets) => duplicate(targets));

  register('bigfs.copyPath', async (targets) => {
    await env.clipboard.writeText(targets.map(getAbsolutePath).join('\n'));
  });

  register('bigfs.copyRelativePath', async (targets) => {
    await env.clipboard.writeText(targets.map(getEntryPath).join('\n'));
  });
};
