import type { Uri } from 'vscode';
import { isDiskPathBelow } from '../../core/paths';
import type { Archive } from './archive';
import type { ArchiveSource } from './archiveSource';

export interface FileLocation {
  container: string;
  detail: string;
}

export interface LocatedArchives {
  getSources(): readonly ArchiveSource[];
  resolveUri(uri: Uri): { archive: Archive; entryPath: string } | undefined;
}

export const describeFileLocation = (
  archives: LocatedArchives,
  uri: Uri,
): FileLocation | undefined => {
  const link = uri.toString(true);

  if (uri.scheme === 'file') {
    const source = archives
      .getSources()
      .find(
        ({ baseUri }) => baseUri.scheme === 'file' && isDiskPathBelow(uri.fsPath, baseUri.fsPath),
      );

    return source
      ? { container: `${source.label} (loose)`, detail: [uri.fsPath, link].join('\n') }
      : undefined;
  }

  const resolved = archives.resolveUri(uri);

  if (!resolved) {
    return undefined;
  }

  const { archive, entryPath } = resolved;
  const source = archives.getSources().find(({ id }) => id === archive.sourceId);

  return {
    container: archive.pathInSource,
    detail: [
      `${source?.label ?? archive.sourceId} › ${archive.pathInSource}`,
      entryPath,
      link,
    ].join('\n'),
  };
};
