import { FileSystemError } from 'vscode';
import type { ArchiveSource } from './archiveSource';
import {
  ReadOnlySourceError,
  assertWritableSource,
  isReadOnlySource,
} from './sourceAccess';

export interface ArchivePolicy {
  isReadOnly(sourceId: string): boolean;
  ensureWritable(sourceId: string): void;
}

export const createArchivePolicy = (
  getSources: () => readonly ArchiveSource[],
): ArchivePolicy => {
  const findSource = (sourceId: string): ArchiveSource | undefined =>
    getSources().find((each) => each.id === sourceId);

  return {
    isReadOnly: (sourceId) => {
      const source = findSource(sourceId);

      return Boolean(source && isReadOnlySource(source));
    },
    ensureWritable: (sourceId) => {
      const source = findSource(sourceId);

      if (!source) {
        return;
      }

      try {
        assertWritableSource(source);
      } catch (error) {
        if (error instanceof ReadOnlySourceError) {
          throw FileSystemError.NoPermissions(error.message);
        }

        throw error;
      }
    },
  };
};
