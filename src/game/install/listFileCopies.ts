import { getGameFiles } from './gameView';
import type { GameFile, GameNode } from './gameView';

export interface FileCopy<T> {
  name: string;
  entryPath: string;
  ref: T;
  origin: string;
  isLoaded: boolean;
  copies: number;
  loadedFrom?: string;
}

const getFileName = (entryPath: string): string =>
  entryPath.slice(entryPath.lastIndexOf('/') + 1);

export const listFileCopies = <T>(root: GameNode<T>): FileCopy<T>[] =>
  getGameFiles(root).flatMap((node) => {
    const winner = node.winner as GameFile<T>;
    const toCopy = (file: GameFile<T>, isLoaded: boolean): FileCopy<T> => ({
      name: getFileName(file.entryPath),
      entryPath: file.entryPath,
      ref: file.ref,
      origin: file.origin,
      isLoaded,
      copies: (node.shadowed?.length ?? 0) + 1,
      ...(isLoaded ? {} : { loadedFrom: winner.origin }),
    });

    return [
      toCopy(winner, true),
      ...(node.shadowed ?? []).map((file) => toCopy(file, false)),
    ];
  });
