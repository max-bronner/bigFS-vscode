import { commands, window, workspace } from 'vscode';
import { formatCount } from '../../core/messages';
import { getChildUri, getNodeUri } from '../../services/archives/nodeAddress';
import { askForName } from '../../platform/dialogs';
import {
  deleteNodes,
  getTargetDirectory,
  importFromDisk,
} from './fileActions';
import { deleteArchives, renameArchive } from './archiveFileActions';
import { refuseDirtyEditors } from './dirtyEditors';
import { isArchiveRoot } from '../../services/archives/virtualTree';
import type { RegisterNodeCommand } from '../../services/archives/nodeCommands';
import type { VirtualNode } from '../../services/archives/virtualNode';
import type { ArchiveModel } from '../../services/archives/archiveModel';

const readChildNames = async (
  directory: VirtualNode,
): Promise<Set<string>> => {
  const children = await workspace.fs.readDirectory(getNodeUri(directory));

  return new Set(children.map(([name]) => name));
};

const createFile = async (target: VirtualNode): Promise<void> => {
  const directory = getTargetDirectory(target);

  if (!directory) {
    return;
  }

  const name = await askForName({
    title: 'New File',
    takenNames: await readChildNames(directory),
  });

  if (!name) {
    return;
  }

  const uri = getChildUri(directory, name);

  await workspace.fs.writeFile(uri, new Uint8Array());
  await commands.executeCommand('vscode.open', uri);
};

const createFolder = async (target: VirtualNode): Promise<void> => {
  const directory = getTargetDirectory(target);

  if (!directory) {
    return;
  }

  const name = await askForName({
    title: 'New Folder',
    takenNames: await readChildNames(directory),
  });

  if (!name) {
    return;
  }

  await workspace.fs.createDirectory(getChildUri(directory, name));
};

const renameNode = async (
  archiveModel: ArchiveModel,
  target: VirtualNode,
): Promise<void> => {
  const directory = target.parent;

  if (!directory) {
    return renameArchive(archiveModel, target);
  }

  if (refuseDirtyEditors([target], 'rename')) {
    return;
  }

  const name = await askForName({
    title: 'Rename',
    takenNames: await readChildNames(directory),
    currentName: target.name,
  });

  if (!name || name === target.name) {
    return;
  }

  await workspace.fs.rename(getNodeUri(target), getChildUri(directory, name), {
    overwrite: false,
  });
};

const addFiles = async (
  archiveModel: ArchiveModel,
  target: VirtualNode,
): Promise<void> => {
  const directory = getTargetDirectory(target);

  if (!directory) {
    return;
  }

  const sourceUris = await window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Add to Archive',
  });

  if (!sourceUris?.length) {
    return;
  }

  const importedCount = await importFromDisk(
    archiveModel,
    sourceUris,
    directory,
  );

  if (importedCount) {
    window.showInformationMessage(
      `Added ${formatCount(importedCount, 'file')} to ${directory.name}.`,
    );
  }
};

export const registerFileCommands = (
  register: RegisterNodeCommand,
  archiveModel: ArchiveModel,
): void => {
  register('bigfs.newFile', ([target]) => createFile(target));
  register('bigfs.newFolder', ([target]) => createFolder(target));
  register('bigfs.rename', ([target]) => renameNode(archiveModel, target));
  register('bigfs.addFiles', ([target]) => addFiles(archiveModel, target));
  register('bigfs.delete', async (targets) => {
    const archiveRoots = targets.filter(isArchiveRoot);

    if (archiveRoots.length) {
      await deleteArchives(archiveModel, archiveRoots);
    }

    await deleteNodes(
      archiveModel,
      targets.filter((target) => !isArchiveRoot(target)),
    );
  });
};
