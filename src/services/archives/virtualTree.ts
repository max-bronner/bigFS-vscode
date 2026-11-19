import { FileType } from 'vscode';
import { getParentPath, splitPath } from '../../core/paths';

export interface TreeNode<TArchive> {
  name: string;
  type: FileType;
  entryPath: string;
  archive: TArchive;
  parent?: TreeNode<TArchive>;
  children?: Map<string, TreeNode<TArchive>>;
}

export const isArchiveRoot = <TArchive>(node: TreeNode<TArchive>): boolean =>
  !node.entryPath;

export const isBelow = <TArchive>(node: TreeNode<TArchive>, other: TreeNode<TArchive>): boolean =>
  node.archive === other.archive &&
  (isArchiveRoot(other)
    ? !isArchiveRoot(node)
    : node.entryPath.startsWith(`${other.entryPath}/`));

export const getRelativeEntryPath = <TArchive>(
  ancestor: TreeNode<TArchive>,
  node: TreeNode<TArchive>,
): string =>
  ancestor.entryPath
    ? node.entryPath.slice(ancestor.entryPath.length + 1)
    : node.entryPath;

const joinEntryPath = (parentPath: string, name: string): string =>
  parentPath ? `${parentPath}/${name}` : name;

const addChild = <TArchive>(
  parentNode: TreeNode<TArchive>,
  childName: string,
  isFile: boolean,
): TreeNode<TArchive> => {
  if (parentNode.type === FileType.File || !parentNode.children) {
    throw Error(`Node is already a file`);
  }

  const childKey = childName.toLowerCase();
  const type = isFile ? FileType.File : FileType.Directory;
  const childNode: TreeNode<TArchive> = parentNode.children.get(childKey) ?? {
    name: childName,
    type,
    entryPath: joinEntryPath(parentNode.entryPath, childName),
    archive: parentNode.archive,
    parent: parentNode,
  };

  if (!isFile && !childNode.children) {
    childNode.children = new Map<string, TreeNode<TArchive>>();
  }

  parentNode.children.set(childKey, childNode);

  return childNode;
};

export const buildVirtualTree = <TArchive extends { name: string }>(
  archive: TArchive,
  entryPaths: Iterable<string>,
): TreeNode<TArchive> => {
  const rootNode: TreeNode<TArchive> = {
    name: archive.name,
    type: FileType.Directory,
    entryPath: '',
    archive,
    children: new Map<string, TreeNode<TArchive>>(),
  };

  for (const entryPath of entryPaths) {
    insertFile(rootNode, entryPath);
  }

  return rootNode;
};

const rewriteEntryPaths = <TArchive>(node: TreeNode<TArchive>, entryPath: string): void => {
  node.entryPath = entryPath;

  node.children?.forEach((child) =>
    rewriteEntryPaths(child, joinEntryPath(entryPath, child.name)),
  );
};

export const insertFile = <TArchive>(
  rootNode: TreeNode<TArchive>,
  entryPath: string,
): TreeNode<TArchive> => {
  const segments = splitPath(entryPath);
  let node = rootNode;

  segments.forEach((segment, index) => {
    node = addChild(node, segment, index === segments.length - 1);
  });

  return node;
};

export const insertDirectory = <TArchive>(
  rootNode: TreeNode<TArchive>,
  directoryPath: string,
): TreeNode<TArchive> => {
  let node = rootNode;

  for (const segment of splitPath(directoryPath)) {
    node = addChild(node, segment, false);
  }

  return node;
};

export const removeNode = <TArchive>(rootNode: TreeNode<TArchive>, entryPath: string): void => {
  const segments = splitPath(entryPath);
  const name = segments.pop();

  if (!name) {
    return;
  }

  findChild(rootNode, segments.join('/'))?.children?.delete(name.toLowerCase());
};

export const moveNode = <TArchive>(
  rootNode: TreeNode<TArchive>,
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
  rewriteEntryPaths(node, joinEntryPath(parent.entryPath, name));
};

export const copyNode = <TArchive>(
  rootNode: TreeNode<TArchive>,
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

export const syncFiles = <TArchive>(
  rootNode: TreeNode<TArchive>,
  entryPaths: Iterable<string>,
): void => {
  const wanted = new Set(
    Array.from(entryPaths, (entryPath) => entryPath.toLowerCase()),
  );

  const prune = (node: TreeNode<TArchive>): void => {
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

export const findBlockingFile = <TArchive>(
  rootNode: TreeNode<TArchive>,
  entryPath: string,
): TreeNode<TArchive> | undefined => {
  let node: TreeNode<TArchive> | undefined = rootNode;

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

export const findChild = <TArchive>(
  directory: TreeNode<TArchive>,
  relativePath: string,
): TreeNode<TArchive> | undefined => {
  let node: TreeNode<TArchive> | undefined = directory;

  for (const segment of splitPath(relativePath)) {
    node = node?.children?.get(segment.toLowerCase());
  }

  return node;
};

export const countFileNodes = <TArchive>(node: TreeNode<TArchive>): number => {
  if (node.type === FileType.File) {
    return 1;
  }

  let count = 0;

  for (const child of node.children?.values() ?? []) {
    count += countFileNodes(child);
  }

  return count;
};

export const getFileNodes = <TArchive>(node: TreeNode<TArchive>): TreeNode<TArchive>[] => {
  if (node.type === FileType.File) {
    return [node];
  }

  const fileNodes: TreeNode<TArchive>[] = [];

  for (const child of node.children?.values() ?? []) {
    fileNodes.push(...getFileNodes(child));
  }

  return fileNodes;
};

export const getTopLevelNodes = <TArchive>(
  nodes: readonly TreeNode<TArchive>[],
): TreeNode<TArchive>[] =>
  nodes.filter(
    (node) => !nodes.some((other) => other !== node && isBelow(node, other)),
  );
