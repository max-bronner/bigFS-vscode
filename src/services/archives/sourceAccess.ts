import { isDiskPathBelow } from '../../core/paths';

export interface WritableSource {
  readonly label: string;
  readonly external: boolean;
}

export interface LocatedSource extends WritableSource {
  readonly baseUri: { readonly scheme: string; readonly fsPath: string };
}

export class ReadOnlySourceError extends Error {
  constructor(label: string) {
    super(
      `${label} is read-only: it is a game install outside the workspace, ` +
        `so its archives are never changed. Copy what you need into a folder of the workspace instead.`,
    );
    this.name = 'ReadOnlySourceError';
  }
}

export class ProtectedArchiveError extends Error {
  constructor(name: string) {
    super(
      `${name} came with the game, and bigFS keeps the game's own archives read-only ` +
        `so that looking around changes nothing by accident. Put your change in your mod's archive, ` +
        `or turn off the bigfs.protectGameArchives setting.`,
    );
    this.name = 'ProtectedArchiveError';
  }
}

export const isReadOnlySource = (source: WritableSource): boolean =>
  source.external;

export const assertWritableSource = (source: WritableSource): void => {
  if (isReadOnlySource(source)) {
    throw new ReadOnlySourceError(source.label);
  }
};

export const isInReadOnlySource = (
  sources: readonly LocatedSource[],
  filePath: string,
  ignoreCase = process.platform === 'win32',
): boolean =>
  sources.some(
    (source) =>
      source.baseUri.scheme === 'file' &&
      isReadOnlySource(source) &&
      isDiskPathBelow(filePath, source.baseUri.fsPath, ignoreCase),
  );
