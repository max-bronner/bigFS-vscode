import { FileSystemError } from 'vscode';
import { isGameArchive } from '../../game/install/gameArchives';
import type { Archive } from './archive';
import type { ArchiveSource } from './archiveSource';
import {
  ProtectedArchiveError,
  ReadOnlySourceError,
  assertWritableSource,
  isReadOnlySource,
} from './sourceAccess';

export type PolicedArchive = Pick<Archive, 'sourceId' | 'pathInSource' | 'name'>;

export interface ArchivePolicy {
  isReadOnly(sourceId: string): boolean;
  ensureWritable(sourceId: string): void;
  isArchiveReadOnly(archive: PolicedArchive): boolean;
  ensureArchiveWritable(archive: PolicedArchive): void;
}

export const createArchivePolicy = (
  getSources: () => readonly ArchiveSource[],
  isProtectingGameArchives: () => boolean = () => true,
): ArchivePolicy => {
  const findSource = (sourceId: string): ArchiveSource | undefined =>
    getSources().find((each) => each.id === sourceId);

  const isProtected = ({ sourceId, pathInSource }: PolicedArchive): boolean => {
    const source = findSource(sourceId);

    return Boolean(
      source && isProtectingGameArchives() && isGameArchive(source.kind, pathInSource),
    );
  };

  const toPermissionError = (error: unknown): unknown =>
    error instanceof ReadOnlySourceError || error instanceof ProtectedArchiveError
      ? FileSystemError.NoPermissions(error.message)
      : error;

  const ensureWritable = (sourceId: string) => {
    const source = findSource(sourceId);

    if (!source) {
      return;
    }

    try {
      assertWritableSource(source);
    } catch (error) {
      throw toPermissionError(error);
    }
  };

  return {
    isReadOnly: (sourceId) => {
      const source = findSource(sourceId);

      return Boolean(source && isReadOnlySource(source));
    },
    ensureWritable,
    isArchiveReadOnly: (archive) => {
      const source = findSource(archive.sourceId);

      return Boolean(source && isReadOnlySource(source)) || isProtected(archive);
    },
    ensureArchiveWritable: (archive) => {
      ensureWritable(archive.sourceId);
      if (isProtected(archive)) {
        throw toPermissionError(new ProtectedArchiveError(archive.name));
      }
    },
  };
};
