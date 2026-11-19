import * as vscode from 'vscode';

const PREFIX = 'ru:';

export interface RuSource {
  uri: vscode.Uri;
  line: number;
}

export const getRuRegionId = ({ uri, line }: RuSource): string =>
  `${PREFIX}${uri.toString()}#${line}`;

export const parseRuRegionId = (id: string): RuSource | undefined => {
  const hash = id.lastIndexOf('#');
  const line = Number(id.slice(hash + 1));

  return id.startsWith(PREFIX) && hash > 0 && Number.isInteger(line)
    ? { uri: vscode.Uri.parse(id.slice(PREFIX.length, hash)), line }
    : undefined;
};
