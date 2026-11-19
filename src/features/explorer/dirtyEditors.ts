import { window, workspace } from 'vscode';
import { SCHEME } from '../../constants';
import { isPathBelow } from '../../core/paths';
import { getNodePath } from '../../services/archives/nodeAddress';
import type { VirtualNode } from '../../services/archives/virtualNode';

export const refuseDirtyEditors = (
  nodes: readonly VirtualNode[],
  operation: string,
): boolean => {
  const paths = nodes.map((node) => getNodePath(node).toLowerCase());
  const dirty = workspace.textDocuments.filter(
    (document) =>
      document.isDirty &&
      document.uri.scheme === SCHEME &&
      paths.some((nodePath) =>
        isPathBelow(document.uri.path.toLowerCase(), nodePath),
      ),
  );

  if (!dirty.length) {
    return false;
  }

  window.showWarningMessage(
    `Save or close ${dirty.map((document) => document.uri.path.split('/').pop()).join(', ')} before you ${operation} it: it has unsaved changes.`,
  );

  return true;
};
