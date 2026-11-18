export interface OutputStore {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

const KEY = 'bigfs.packedArchives';

const outputs = new Set<string>();
let store: OutputStore | undefined;

export const useOutputStore = (given: OutputStore): void => {
  store = given;
  given.get<string[]>(KEY, []).forEach((each) => outputs.add(each));
};

export const recordPackedArchive = (archivePath: string): void => {
  outputs.add(archivePath.toLowerCase());
  void store?.update(KEY, [...outputs]);
};

export const packedArchives = (): ReadonlySet<string> => outputs;
