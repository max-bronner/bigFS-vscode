export type RowContextKind =
  | 'source'
  | 'diskFolder'
  | 'archive'
  | 'folder'
  | 'file'
  | 'gameFolder'
  | 'looseFile';

const READ_ONLY_SUFFIX = 'ReadOnly';

const CONTEXT_PREFIXES: Record<RowContextKind, string> = {
  source: 'bigSource',
  diskFolder: 'bigDiskFolder',
  archive: 'bigArchive',
  folder: 'bigFolder',
  file: 'bigFile',
  gameFolder: 'bigGameFolder',
  looseFile: 'bigLooseFile',
};

export const getContextValue = (
  kind: RowContextKind,
  isReadOnly = false,
): string => `${CONTEXT_PREFIXES[kind]}${isReadOnly ? READ_ONLY_SUFFIX : ''}`;
