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

const normal = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const within = (path: string, folder: string): boolean => {
  const inner = normal(path);
  const outer = normal(folder);

  return outer !== '' && (inner === outer || inner.startsWith(`${outer}/`));
};

export const isModFile = (
  path: string,
  workspaceFolders: readonly string[],
  baseGameFolders: readonly string[],
): boolean =>
  workspaceFolders.some((folder) => within(path, folder)) &&
  !baseGameFolders.some((folder) => within(path, folder));
