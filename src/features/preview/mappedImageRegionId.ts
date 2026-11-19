import * as vscode from 'vscode';

const PREFIX = 'mappedImage:';

export interface MappedImageSource {
  uri: vscode.Uri;
  name: string;
  line: number;
}

export const getMappedImageRegionId = ({
  uri,
  name,
  line,
}: MappedImageSource): string => `${PREFIX}${uri.toString()}#${line}#${name}`;

export const parseMappedImageRegionId = (
  id: string,
): MappedImageSource | undefined => {
  const nameHash = id.lastIndexOf('#');
  const lineHash = id.lastIndexOf('#', nameHash - 1);
  const line = Number(id.slice(lineHash + 1, nameHash));

  return id.startsWith(PREFIX) && lineHash > 0 && Number.isInteger(line)
    ? {
        uri: vscode.Uri.parse(id.slice(PREFIX.length, lineHash)),
        name: id.slice(nameHash + 1),
        line,
      }
    : undefined;
};
