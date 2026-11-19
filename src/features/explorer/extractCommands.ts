import {
  commands,
  window,
  workspace,
  CancellationError,
  FileType,
  ProgressLocation,
  Uri,
} from 'vscode';
import type { CancellationToken, Progress } from 'vscode';
import path from 'path';
import { isContainedPath, splitPath } from '../../core/paths';
import { resolveConflicts } from '../../platform/dialogs';
import { getFileNodes, getRelativeEntryPath, getTopLevelNodes, isArchiveRoot } from '../../services/archives/virtualTree';
import { getNodeUri } from '../../services/archives/nodeAddress';
import type { RegisterNodeCommand } from '../../services/archives/nodeCommands';
import type { VirtualNode } from '../../services/archives/virtualNode';
import type { ArchiveModel } from '../../services/archives/archiveModel';

const REVEAL_LABEL = 'Reveal in File Explorer';

interface ExtractedFile {
  name: string;
  node: VirtualNode;
  targetUri: Uri;
}

const getExtractedName = (node: VirtualNode): string =>
  isArchiveRoot(node)
    ? node.name.slice(
        0,
        node.name.length - path.posix.extname(node.name).length,
      )
    : node.name;

const getExtractedPath = (node: VirtualNode, fileNode: VirtualNode): string =>
  fileNode === node
    ? node.name
    : `${getExtractedName(node)}/${getRelativeEntryPath(node, fileNode)}`;

export const getExtractedFiles = (
  nodes: readonly VirtualNode[],
  targetDirectoryUri: Uri,
): ExtractedFile[] => {
  const extractedFiles: ExtractedFile[] = [];

  for (const node of nodes) {
    for (const fileNode of getFileNodes(node)) {
      const relativePath = getExtractedPath(node, fileNode);

      if (!isContainedPath(relativePath)) {
        throw new Error(
          `Refusing to extract outside the target: ${relativePath}`,
        );
      }

      extractedFiles.push({
        name: relativePath,
        node: fileNode,
        targetUri: Uri.joinPath(targetDirectoryUri, ...splitPath(relativePath)),
      });
    }
  }

  return extractedFiles;
};

const exists = async (uri: Uri): Promise<boolean> => {
  try {
    await workspace.fs.stat(uri);

    return true;
  } catch {
    return false;
  }
};

const withoutSkippedFiles = async (
  extractedFiles: ExtractedFile[],
): Promise<ExtractedFile[]> => {
  const takenNames = new Set<string>();

  for (const file of extractedFiles) {
    if (await exists(file.targetUri)) {
      takenNames.add(file.name);
    }
  }

  return resolveConflicts(extractedFiles, (file) => takenNames.has(file.name));
};

const extractToFile = async (node: VirtualNode): Promise<Uri | undefined> => {
  const targetUri = await window.showSaveDialog({
    defaultUri: Uri.file(node.name),
    saveLabel: 'Extract',
  });

  if (!targetUri) {
    return undefined;
  }

  const content = await workspace.fs.readFile(getNodeUri(node));

  await workspace.fs.writeFile(targetUri, content);

  return targetUri;
};

const extractToDirectory = async (
  archiveModel: ArchiveModel,
  nodes: readonly VirtualNode[],
): Promise<Uri | undefined> => {
  const targetDirectoryUris = await window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Extract Here',
  });

  const targetDirectoryUri = targetDirectoryUris?.[0];

  if (!targetDirectoryUri) {
    return undefined;
  }

  const extractedFiles = await withoutSkippedFiles(
    getExtractedFiles(nodes, targetDirectoryUri),
  );

  if (!extractedFiles.length) {
    return undefined;
  }

  const writeFiles = async (
    progress: Progress<{ message?: string; increment?: number }>,
    token: CancellationToken,
  ): Promise<void> => {
    const increment = 100 / extractedFiles.length;
    let written = 0;

    await archiveModel.readFiles(extractedFiles, async (file, content) => {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }

      written += 1;
      progress.report({
        increment,
        message: `${written} of ${extractedFiles.length}`,
      });

      await workspace.fs.writeFile(file.targetUri, content);
    });
  };

  try {
    await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Extracting',
        cancellable: true,
      },
      writeFiles,
    );
  } catch (error) {
    if (error instanceof CancellationError) {
      return undefined;
    }

    throw error;
  }

  return targetDirectoryUri;
};

const extractNodes = async (
  archiveModel: ArchiveModel,
  nodes: readonly VirtualNode[],
): Promise<void> => {
  const topLevelNodes = getTopLevelNodes(nodes);
  const singleFile =
    topLevelNodes.length === 1 && topLevelNodes[0].type === FileType.File
      ? topLevelNodes[0]
      : undefined;

  const targetUri = singleFile
    ? await extractToFile(singleFile)
    : await extractToDirectory(archiveModel, topLevelNodes);

  if (!targetUri) {
    return;
  }

  const selectedOption = await window.showInformationMessage(
    `Extracted to ${targetUri.fsPath}.`,
    REVEAL_LABEL,
  );

  if (selectedOption === REVEAL_LABEL) {
    await commands.executeCommand('revealFileInOS', targetUri);
  }
};

export const registerExtractCommands = (
  register: RegisterNodeCommand,
  archiveModel: ArchiveModel,
): void => {
  register('bigfs.extract', (targets) => extractNodes(archiveModel, targets));
};
