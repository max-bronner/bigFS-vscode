import { FileType } from 'vscode';
import { getParentPath, splitPath } from '../../core/paths';
import type { Archive } from './archive';

export interface VirtualNode {
  name: string;
  type: FileType;
  entryPath: string;
  archive: Archive;
  parent?: VirtualNode;
  children?: Map<string, VirtualNode>;
}

export const isArchiveRoot = (node: VirtualNode): boolean => !node.entryPath;

export const isInside = (node: VirtualNode, other: VirtualNode): boolean =>
  node.archive === other.archive &&
  (isArchiveRoot(other)
    ? !isArchiveRoot(node)
    : node.entryPath.startsWith(`${other.entryPath}/`));

export const getRelativeEntryPath = (
  ancestor: VirtualNode,
  node: VirtualNode,
): string =>
  ancestor.entryPath
    ? node.entryPath.slice(ancestor.entryPath.length + 1)
    : node.entryPath;

const joinEntryPath = (parentPath: string, name: string): string =>
  parentPath ? `${parentPath}/${name}` : name;

const addChild = (
  parentNode: VirtualNode,
  childName: string,
  isFile: boolean,
): VirtualNode => {
  if (parentNode.type === FileType.File || !parentNode.children) {
    throw Error(`Node is already a file`);
  }

  const childKey = childName.toLowerCase();
  const type = isFile ? FileType.File : FileType.Directory;
  const childNode: VirtualNode = parentNode.children.get(childKey) ?? {
    name: childName,
    type,
    entryPath: joinEntryPath(parentNode.entryPath, childName),
    archive: parentNode.archive,
    parent: parentNode,
  };

  if (!isFile && !childNode.children) {
    childNode.children = new Map<string, VirtualNode>();
  }

  parentNode.children.set(childKey, childNode);

  return childNode;
};

export const buildVirtualTree = (
  archive: Archive,
  entryPaths: Iterable<string>,
): VirtualNode => {
  const rootNode: VirtualNode = {
    name: archive.name,
    type: FileType.Directory,
    entryPath: '',
    archive,
    children: new Map<string, VirtualNode>(),
  };

  for (const entryPath of entryPaths) {
    insertFile(rootNode, entryPath);
  }

  return rootNode;
};

const reEntryPath = (node: VirtualNode, entryPath: string): void => {
  node.entryPath = entryPath;

  node.children?.forEach((child) =>
    reEntryPath(child, joinEntryPath(entryPath, child.name)),
  );
};

export const insertFile = (
  rootNode: VirtualNode,
  entryPath: string,
): VirtualNode => {
  const segments = splitPath(entryPath);
  let node = rootNode;

  segments.forEach((segment, index) => {
    node = addChild(node, segment, index === segments.length - 1);
  });

  return node;
};

export const insertDirectory = (
  rootNode: VirtualNode,
  directoryPath: string,
): VirtualNode => {
  let node = rootNode;

  for (const segment of splitPath(directoryPath)) {
    node = addChild(node, segment, false);
  }

  return node;
};

export const removeNode = (rootNode: VirtualNode, entryPath: string): void => {
  const segments = splitPath(entryPath);
  const name = segments.pop();

  if (!name) {
    return;
  }

  findChild(rootNode, segments.join('/'))?.children?.delete(name.toLowerCase());
};

export const moveNode = (
  rootNode: VirtualNode,
  from: string,
  to: string,
): void => {
  const node = findChild(rootNode, from);

  if (!node) {
    return;
  }

  removeNode(rootNode, from);

  const name = splitPath(to).at(-1);

  if (!name) {
    return;
  }

  const parent = insertDirectory(rootNode, getParentPath(to));

  node.name = name;
  node.parent = parent;
  parent.children?.set(name.toLowerCase(), node);
  reEntryPath(node, joinEntryPath(parent.entryPath, name));
};

export const copyNode = (
  rootNode: VirtualNode,
  from: string,
  to: string,
): void => {
  const source = findChild(rootNode, from);

  if (!source) {
    return;
  }

  if (source.type === FileType.File) {
    insertFile(rootNode, to);
    return;
  }

  insertDirectory(rootNode, to);

  source.children?.forEach((child) =>
    copyNode(rootNode, `${from}/${child.name}`, `${to}/${child.name}`),
  );
};

export const syncFiles = (
  rootNode: VirtualNode,
  entryPaths: Iterable<string>,
): void => {
  const wanted = new Set(
    Array.from(entryPaths, (entryPath) => entryPath.toLowerCase()),
  );

  const prune = (node: VirtualNode): void => {
    node.children?.forEach((child, key) => {
      if (child.type !== FileType.File) {
        prune(child);
        return;
      }

      if (!wanted.has(child.entryPath.toLowerCase())) {
        node.children?.delete(key);
      }
    });
  };

  prune(rootNode);

  for (const entryPath of entryPaths) {
    insertFile(rootNode, entryPath);
  }
};

export const findBlockingFile = (
  rootNode: VirtualNode,
  entryPath: string,
): VirtualNode | undefined => {
  let node: VirtualNode | undefined = rootNode;

  for (const segment of splitPath(getParentPath(entryPath))) {
    node = node?.children?.get(segment.toLowerCase());

    if (!node) {
      return undefined;
    }

    if (node.type === FileType.File) {
      return node;
    }
  }

  return undefined;
};

export const findChild = (
  directory: VirtualNode,
  relativePath: string,
): VirtualNode | undefined => {
  let node: VirtualNode | undefined = directory;

  for (const segment of splitPath(relativePath)) {
    node = node?.children?.get(segment.toLowerCase());
  }

  return node;
};

export const countFileNodes = (node: VirtualNode): number => {
  if (node.type === FileType.File) {
    return 1;
  }

  let count = 0;

  for (const child of node.children?.values() ?? []) {
    count += countFileNodes(child);
  }

  return count;
};

export const getFileNodes = (node: VirtualNode): VirtualNode[] => {
  if (node.type === FileType.File) {
    return [node];
  }

  const fileNodes: VirtualNode[] = [];

  for (const child of node.children?.values() ?? []) {
    fileNodes.push(...getFileNodes(child));
  }

  return fileNodes;
};

export const getTopLevelNodes = (
  nodes: readonly VirtualNode[],
): VirtualNode[] =>
  nodes.filter(
    (node) => !nodes.some((other) => other !== node && isInside(node, other)),
  );
