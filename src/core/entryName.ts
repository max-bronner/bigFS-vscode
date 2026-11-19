export const MAX_ENTRY_PATH_LENGTH = 255;

const RESERVED_DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const FORBIDDEN_CHARACTERS = /[<>:"|?*\u0000-\u001f]/;

const UNSTORABLE_CHARACTER = /[^ -~ -ÿ]/;

export const validateEntryName = (name: string): string | undefined => {
  if (!name.trim()) {
    return 'A name is required.';
  }

  if (/[\\/]/.test(name)) {
    return 'A name cannot contain a path separator.';
  }

  if (name === '.' || name === '..') {
    return `${name} is not a valid name.`;
  }

  if (name !== name.trim()) {
    return 'A name cannot start or end with a space.';
  }

  if (name.endsWith('.')) {
    return 'A name cannot end with a dot.';
  }

  if (FORBIDDEN_CHARACTERS.test(name)) {
    return 'A name cannot contain < > : " | ? * or control characters.';
  }

  if (RESERVED_DEVICE_NAMES.test(name.split('.')[0])) {
    return `${name.split('.')[0]} is a reserved name on Windows.`;
  }

  if (UNSTORABLE_CHARACTER.test(name)) {
    return 'A name can only hold Windows-1252 characters: the archive stores one byte per character.';
  }

  return undefined;
};

export const validateEntryPath = (entryPath: string): string | undefined => {
  if (!entryPath) {
    return 'A path is required.';
  }

  if (/^[\\/]|[\\/]$/.test(entryPath)) {
    return 'A path cannot start or end with a separator.';
  }

  if (entryPath.length > MAX_ENTRY_PATH_LENGTH) {
    return `A path can hold at most ${MAX_ENTRY_PATH_LENGTH} characters.`;
  }

  for (const segment of entryPath.split(/[\\/]/)) {
    const problem = segment ? validateEntryName(segment) : 'A path cannot hold an empty segment.';

    if (problem) {
      return problem;
    }
  }

  return undefined;
};

export interface PathProblem {
  index: number;
  path: string;
  reason: string;
}

export const findPathClashes = (
  paths: readonly string[],
  existingFiles: readonly string[] = [],
): PathProblem[] => {
  const existing = new Set(existingFiles.map((file) => file.toLowerCase()));
  const files = new Set<string>();
  const directories = new Set<string>();
  const clashes: PathProblem[] = [];

  for (const [index, entryPath] of paths.entries()) {
    const segments = entryPath.toLowerCase().split('/');
    const key = segments.join('/');
    const parents = segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
    const blocker = parents.find(
      (parent) => files.has(parent) || existing.has(parent),
    );

    if (files.has(key)) {
      clashes.push({ index, path: entryPath, reason: 'The same path is added twice.' });
    } else if (directories.has(key)) {
      clashes.push({ index, path: entryPath, reason: 'A folder of that name exists.' });
    } else if (blocker) {
      clashes.push({ index, path: entryPath, reason: `${blocker} is a file, not a folder.` });
    } else {
      files.add(key);
      parents.forEach((parent) => directories.add(parent));
    }
  }

  return clashes;
};

export type MoveRefusal = 'itself' | 'inside' | 'sameFolder';

export const getMoveRefusal = (
  sourcePath: string,
  targetDirectoryPath: string,
): MoveRefusal | undefined => {
  const source = sourcePath.toLowerCase();
  const target = targetDirectoryPath.toLowerCase();

  if (source === target) {
    return 'itself';
  }

  if (target.startsWith(`${source}/`)) {
    return 'inside';
  }

  const separator = source.lastIndexOf('/');

  return (separator < 0 ? '' : source.slice(0, separator)) === target ? 'sameFolder' : undefined;
};

export const toArchiveFileName = (
  input: string,
): { name: string } | { error: string } => {
  const typed = input.trim();
  const name = /\.big$/i.test(typed) ? typed : `${typed}.big`;
  const stem = name.slice(0, -4);

  if (!stem) {
    return { error: 'A name is required.' };
  }

  const problem = validateEntryName(name);

  return problem ? { error: problem } : { name };
};
