import { Uri, workspace } from 'vscode';

const normalize = (segments: readonly string[]): string[] => {
  const resolved: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      resolved.pop();
      continue;
    }

    resolved.push(segment);
  }

  return resolved;
};

export const resolveIncludeUri = (
  documentUri: Uri,
  includePath: string,
): Uri => {
  const directory = documentUri.path.split('/').slice(0, -1);
  const relative = includePath.split(/[\\/]/);
  const resolved = normalize([...directory, ...relative]);

  return documentUri.with({ path: `/${resolved.join('/')}` });
};

export const includeExists = async (uri: Uri): Promise<boolean> => {
  try {
    await workspace.fs.stat(uri);

    return true;
  } catch {
    return false;
  }
};
