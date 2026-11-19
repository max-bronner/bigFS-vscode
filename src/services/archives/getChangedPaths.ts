import type { EntryChange } from './archive';

export const getChangedPaths = (changes: readonly EntryChange[]): string[] =>
  changes.flatMap((change) => {
    switch (change.kind) {
      case 'addDirectory':
        return [];
      case 'move':
      case 'copy':
        return [change.from, change.to];
      default:
        return [change.path];
    }
  });
