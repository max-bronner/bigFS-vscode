export interface WritableSource {
  readonly label: string;
  readonly external: boolean;
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

export const isReadOnlySource = (source: WritableSource): boolean =>
  source.external;

export const assertWritableSource = (source: WritableSource): void => {
  if (isReadOnlySource(source)) {
    throw new ReadOnlySourceError(source.label);
  }
};
