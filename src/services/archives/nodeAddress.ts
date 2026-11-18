import { Uri } from 'vscode';
import { SCHEME } from '../../constants';
import { isPathBelow, splitPath } from '../../core/paths';
import type { Archive } from './archive';
import type { VirtualNode } from './virtualNode';

export interface ResolvedUri {
  archive: Archive;
  entryPath: string;
}

export const getNodePath = (node: VirtualNode): string =>
  node.entryPath
    ? `${node.archive.rootPath}/${node.entryPath}`
    : node.archive.rootPath;

export const getNodeUri = (node: VirtualNode): Uri =>
  Uri.from({ scheme: SCHEME, path: getNodePath(node) });

export const getChildUri = (directory: VirtualNode, name: string): Uri =>
  Uri.from({ scheme: SCHEME, path: `${getNodePath(directory)}/${name}` });

export const parseNodeUri = (
  uri: Uri,
  archives: Iterable<Archive>,
): ResolvedUri | undefined => {
  const wanted = uri.path.toLowerCase();
  let match: Archive | undefined;

  for (const archive of archives) {
    if (
      isPathBelow(wanted, archive.rootKey) &&
      archive.rootKey.length > (match?.rootKey.length ?? 0)
    ) {
      match = archive;
    }
  }

  if (!match) {
    return undefined;
  }

  return {
    archive: match,
    entryPath: splitPath(uri.path.slice(match.rootPath.length)).join('/'),
  };
};
