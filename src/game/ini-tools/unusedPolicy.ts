export const REPORTABLE_KINDS: ReadonlySet<string> = new Set(
  [
    'Armor',
    'CommandButton',
    'DamageFX',
    'FXList',
    'FXParticleSystem',
    'ParticleSystem',
    'Locomotor',
    'ModifierList',
    'ObjectCreationList',
    'Weapon',
  ].map((kind) => kind.toLowerCase()),
);

export const isReportableKind = (keyword: string): boolean =>
  REPORTABLE_KINDS.has(keyword.toLowerCase());

const normalizeFolderPath = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const isPathWithin = (path: string, folder: string): boolean => {
  const inner = normalizeFolderPath(path);
  const outer = normalizeFolderPath(folder);

  return outer !== '' && (inner === outer || inner.startsWith(`${outer}/`));
};

export const isModFile = (
  path: string,
  workspaceFolders: readonly string[],
  baseGameFolders: readonly string[],
): boolean =>
  workspaceFolders.some((folder) => isPathWithin(path, folder)) &&
  !baseGameFolders.some((folder) => isPathWithin(path, folder));
