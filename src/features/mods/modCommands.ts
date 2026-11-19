import {
  FileType,
  ProgressLocation,
  Uri,
  commands,
  window,
  workspace,
} from 'vscode';
import type { Disposable } from 'vscode';
import path from 'path';
import { writeArchiveFile } from '../../node/archiveFile';
import type { BigFileEntry } from '../../formats/big/bigFormat';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { getFileNodes } from '../../services/archives/virtualTree';
import type { VirtualNode } from '../../services/archives/virtualNode';
import { isSkippedFromPackage } from '../../node/modPackage';
import { recordPackedArchive } from '../../services/archives/packagedOutputs';
import { formatCount } from '../../core/messages';
import type { RegisterNodeCommand } from '../../services/archives/nodeCommands';
import { registerCommand } from '../../platform/commands';

const BIG4_TRAILER = Uint8Array.from([0x4c, 0x32, 0x31, 0x39, 0, 0, 0, 0]);

export const listFiles = async (
  folder: Uri,
  relative = '',
): Promise<{ uri: Uri; relativePath: string; size: number }[]> => {
  const files: { uri: Uri; relativePath: string; size: number }[] = [];

  for (const [name, type] of await workspace.fs.readDirectory(folder)) {
    const uri = Uri.joinPath(folder, name);
    const relativePath = relative ? `${relative}/${name}` : name;

    if (type === FileType.Directory) {
      files.push(...(await listFiles(uri, relativePath)));
    } else if (type === FileType.File) {
      files.push({
        uri,
        relativePath,
        size: (await workspace.fs.stat(uri)).size,
      });
    }
  }

  return files;
};

const packFolder = async (folder: Uri): Promise<void> => {
  if (folder.scheme !== 'file') {
    throw new Error('Only a folder on disk can be packed');
  }

  const target = await window.showSaveDialog({
    defaultUri: Uri.file(`${folder.fsPath}.big`),
    filters: { 'BIG archive': ['big'] },
    saveLabel: 'Pack',
  });

  if (!target) {
    return;
  }

  const count = await window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: `Packing ${path.basename(target.fsPath)}`,
    },
    () => packFolderInto(folder, target, isSkippedFromPackage),
  );

  if (count) {
    window.showInformationMessage(
      `Packed ${formatCount(count, 'file')} into ${path.basename(target.fsPath)}.`,
    );
  } else {
    window.showWarningMessage(
      `${path.basename(folder.fsPath)} holds no files.`,
    );
  }
};

export const packFolderInto = async (
  folder: Uri,
  target: Uri,
  skip: (relativePath: string) => boolean = () => false,
): Promise<number> => {
  const files = (await listFiles(folder)).filter(
    (file) => !skip(file.relativePath),
  );

  if (files.length) {
    const entries = new Map<string, BigFileEntry>(
      files.map(({ uri, relativePath, size }) => [
        relativePath.toLowerCase(),
        { name: relativePath, offset: 0, size, pendingFile: uri.fsPath },
      ]),
    );

    await writeArchiveFile(
      target.fsPath,
      { magic: 'BIG4', trailer: BIG4_TRAILER },
      entries,
    );
    recordPackedArchive(target.fsPath);
  }

  return files.length;
};

const overrideInFolder = async (
  archiveModel: ArchiveModel,
  targets: VirtualNode[],
): Promise<void> => {
  const [folder] =
    (await window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      defaultUri: workspace.workspaceFolders?.[0]?.uri,
      openLabel: 'Copy Here',
      title: 'Folder of the mod that overrides these files',
    })) ?? [];

  if (!folder) {
    return;
  }

  const fileNodes = targets.flatMap((target) => getFileNodes(target));
  const destinations = fileNodes.map((node) => ({
    node,
    uri: Uri.joinPath(folder, ...node.entryPath.split('/')),
  }));
  const existing: string[] = [];

  for (const { node, uri } of destinations) {
    try {
      await workspace.fs.stat(uri);
      existing.push(node.entryPath);
    } catch {
    }
  }

  if (existing.length) {
    const answer = await window.showWarningMessage(
      `${formatCount(existing.length, 'file')} already in the folder will be replaced.`,
      { modal: true, detail: existing.slice(0, 10).join('\n') },
      'Replace',
    );

    if (answer !== 'Replace') {
      return;
    }
  }

  await archiveModel.readFiles(destinations, async ({ uri }, content) => {
    await workspace.fs.writeFile(uri, content);
  });

  window.showInformationMessage(
    `Copied ${formatCount(destinations.length, 'file')} into ${path.basename(folder.fsPath)}.`,
  );

  if (destinations.length === 1) {
    await commands.executeCommand('vscode.open', destinations[0].uri);
  }
};

export const registerModCommands = (
  register: RegisterNodeCommand,
  archiveModel: ArchiveModel,
): Disposable[] => {
  register('bigfs.overrideInFolder', (targets) =>
    overrideInFolder(archiveModel, targets),
  );

  return [
    registerCommand('bigfs.packFolder', (folder?: Uri) =>
      folder ? packFolder(folder) : undefined,
    ),
  ];
};
