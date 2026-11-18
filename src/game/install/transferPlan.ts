import { getAvailableName, getParentPath } from '../../core/paths';

export type ConflictChoice = 'replace' | 'skip' | 'keepBoth';

export interface TransferItem {
  path: string;
}

export interface TargetContent {
  files: Iterable<string>;
  directories: Iterable<string>;
}

export interface PlannedTransfer<T extends TransferItem> {
  item: T;
  targetPath: string;
  replaces: boolean;
}

const key = (path: string): string => path.toLowerCase();

export const findConflicts = <T extends TransferItem>(
  items: readonly T[],
  target: TargetContent,
): T[] => {
  const files = new Set(Array.from(target.files, key));

  return items.filter((item) => files.has(key(item.path)));
};

const getFreePath = (path: string, taken: ReadonlySet<string>): string => {
  const parent = getParentPath(path);
  const name = path.slice(parent ? parent.length + 1 : 0);
  const siblings = Array.from(taken)
    .filter((each) => getParentPath(each) === key(parent))
    .map((each) => each.slice(parent ? parent.length + 1 : 0));
  const free = getAvailableName(siblings, name);

  return parent ? `${parent}/${free}` : free;
};

export const planTransfer = <T extends TransferItem>(
  items: readonly T[],
  target: TargetContent,
  choice: ConflictChoice,
): PlannedTransfer<T>[] => {
  const existingFiles = new Set(Array.from(target.files, key));
  const directories = new Set(Array.from(target.directories, key));
  const taken = new Set([...existingFiles, ...directories]);
  const planned: PlannedTransfer<T>[] = [];

  for (const item of items) {
    const itemKey = key(item.path);
    const clashesFile = existingFiles.has(itemKey);
    const mustRename =
      directories.has(itemKey) ||
      (taken.has(itemKey) && !clashesFile) ||
      (clashesFile && choice === 'keepBoth') ||
      planned.some((each) => key(each.targetPath) === itemKey);

    if (clashesFile && choice === 'skip') {
      continue;
    }

    if (mustRename) {
      const targetPath = getFreePath(item.path, taken);

      taken.add(key(targetPath));
      planned.push({ item, targetPath, replaces: false });
      continue;
    }

    taken.add(itemKey);
    planned.push({ item, targetPath: item.path, replaces: clashesFile });
  }

  return planned;
};
