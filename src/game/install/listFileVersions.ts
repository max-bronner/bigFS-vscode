import { isGameArchive } from './gameArchives';
import type { InstallKind } from './installLayers';

export interface VersionLayer {
  label: string;
  kind: InstallKind;
  base: boolean;
}

export interface VersionCandidate<T> {
  ref: T;
  key: string;
  archive?: string;
  layer: VersionLayer;
}

export interface StackCandidates<T> {
  top: VersionLayer;
  copies: readonly VersionCandidate<T>[];
}

export interface FileVersion<T> extends VersionCandidate<T> {
  place: number;
  stack: VersionLayer;
  isOtherStack: boolean;
  isRetail: boolean;
}

export interface FileVersions<T> {
  open?: FileVersion<T>;
  others: FileVersion<T>[];
  retail?: FileVersion<T>;
}

export const listFileVersions = <T>(
  stacks: readonly StackCandidates<T>[],
  openKey: string,
): FileVersions<T> => {
  const seen = new Set<string>();
  const versions: FileVersion<T>[] = [];

  for (const [index, { top, copies }] of stacks.entries()) {
    for (const [position, copy] of copies.entries()) {
      if (seen.has(copy.key)) {
        continue;
      }

      seen.add(copy.key);
      versions.push({
        ...copy,
        place: position + 1,
        stack: top,
        isOtherStack: index > 0,
        isRetail:
          copy.archive !== undefined && isGameArchive(copy.layer.kind, copy.archive),
      });
    }
  }

  const open = versions.find((version) => version.key === openKey);
  const retail = versions.find((version) => version.isRetail);

  return {
    open,
    others: versions.filter((version) => version !== open),
    retail: retail === open ? undefined : retail,
  };
};
