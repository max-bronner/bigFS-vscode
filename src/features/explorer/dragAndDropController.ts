import { Uri, DataTransfer, DataTransferItem, FileType, window } from 'vscode';
import type { TreeDragAndDropController } from 'vscode';
import { importFromDisk, transferNodes } from './fileActions';
import { copyArchivesInto } from './archiveFileActions';
import { formatCount } from '../../core/messages';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { VirtualNode } from '../../services/archives/virtualNode';
import {
  isFolderRow,
  isGameRow,
  isSourceRow,
  isVirtualNode,
} from '../../services/archives/explorerRow';
import type { ExplorerRow } from '../../services/archives/explorerRow';

export class BigDragAndDropController implements TreeDragAndDropController<ExplorerRow> {
  readonly dropMimeTypes = [
    'application/vnd.code.tree.bigArchiveExplorer',
    'text/uri-list',
  ];
  readonly dragMimeTypes = ['application/vnd.code.tree.bigArchiveExplorer'];

  constructor(private archiveModel: ArchiveModel) {}

  async handleDrag(
    source: readonly ExplorerRow[],
    dataTransfer: DataTransfer,
  ): Promise<void> {
    dataTransfer.set(
      this.dragMimeTypes[0],
      new DataTransferItem(source.filter(isVirtualNode)),
    );
  }

  async handleDrop(
    target: ExplorerRow | undefined,
    dataTransfer: DataTransfer,
  ): Promise<void> {
    if (target && isGameRow(target)) {
      window.showWarningMessage(
        'The game view only shows what the game loads. Drop into an archive of the workspace instead.',
      );

      return;
    }

    try {
      if (target && (isSourceRow(target) || isFolderRow(target))) {
        await this.dropOnDiskFolder(target, dataTransfer);

        return;
      }

      const directory =
        target && isVirtualNode(target)
          ? this.resolveDropDirectory(target)
          : undefined;

      if (directory) {
        await this.dropIntoArchive(directory, dataTransfer);
      }
    } catch (error) {
      window.showErrorMessage(`Drop failed: ${error}`);
    }
  }

  private async dropOnDiskFolder(
    target: ExplorerRow,
    dataTransfer: DataTransfer,
  ): Promise<void> {
    const copied = await copyArchivesInto(
      this.archiveModel,
      target,
      this.readDroppedUris(dataTransfer),
    );

    if (copied) {
      window.showInformationMessage(`Copied ${formatCount(copied, 'archive')}.`);
    }
  }

  private async dropIntoArchive(
    directory: VirtualNode,
    dataTransfer: DataTransfer,
  ): Promise<void> {
    const internalData = dataTransfer.get(this.dropMimeTypes[0]);

    if (internalData) {
      const { transferred, moved } = await transferNodes(
        this.archiveModel,
        internalData.value as VirtualNode[],
        directory,
        'move',
      );

      if (transferred) {
        window.showInformationMessage(
          `${moved ? 'Moved' : 'Copied'} ${formatCount(transferred, 'file')} to ${directory.name}.`,
        );
      }

      return;
    }

    const sourceUris = this.readDroppedUris(dataTransfer);

    if (!sourceUris.length) {
      return;
    }

    const imported = await importFromDisk(
      this.archiveModel,
      sourceUris,
      directory,
    );

    if (imported) {
      window.showInformationMessage(
        `Added ${formatCount(imported, 'file')} to ${directory.name}.`,
      );
    }
  }

  private readDroppedUris(dataTransfer: DataTransfer): Uri[] {
    const value = dataTransfer.get(this.dropMimeTypes[1])?.value;

    return String(value ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => Uri.parse(line));
  }

  private resolveDropDirectory(target: VirtualNode): VirtualNode | undefined {
    if (target.type === FileType.Directory) {
      return target;
    }

    return target.parent;
  }
}
