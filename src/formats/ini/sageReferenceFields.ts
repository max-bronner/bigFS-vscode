import { lastContextSegment } from '../../game/audio/sageAudioFields';

export const OBJECT_NAMESPACE = 'Object';

const NAMESPACE_ALIASES: Record<string, string> = {
  childobject: OBJECT_NAMESPACE,
  objectreskin: OBJECT_NAMESPACE,
};

export const canonicalNamespace = (namespace: string): string =>
  NAMESPACE_ALIASES[namespace.toLowerCase()] ?? namespace;

export const canonicalNamespaces = (
  namespaces: readonly string[],
): string[] => [...new Set(namespaces.map(canonicalNamespace))];

export const widenParticleNamespaces = (
  namespaces: readonly string[],
): string[] =>
  namespaces.some((namespace) => namespace.toLowerCase() === 'fxparticlesystem') &&
  !namespaces.some((namespace) => namespace.toLowerCase() === 'particlesystem')
    ? [...namespaces, 'ParticleSystem']
    : [...namespaces];

const PARENT_HEADERS: ReadonlySet<string> = new Set([
  'childobject',
  'objectreskin',
]);

export const parentNamespace = (keyword: string): string | undefined =>
  PARENT_HEADERS.has(keyword.toLowerCase()) ? OBJECT_NAMESPACE : undefined;

export const NOT_REFERENCE_FIELDS: ReadonlySet<string> = new Set([
  'filename',
  'armorsetflag',
  'geometryissmall',
  'shadowoverridelodvisibility',
]);

export const NOT_REFERENCE_NAMESPACES: ReadonlySet<string> = new Set([
  'animationstate',
  'modelconditionstate',
]);

const SCOPED_REFERENCES: Record<string, readonly string[]> = {
  'fxlist > particlesystem/name': ['FXParticleSystem', 'ParticleSystem'],
  'mousecursor/image': [],
  'autoresolvearmor/armor': [],
  'autoresolveweapon/weapon': [],
  'region/subobject': [],
  'weapon/chaseweapon': [],
  'taskafteraudio/params': [],
  'experiencelevel/targetnames': [],
};

const REFERENCE_TOKENS: Record<string, readonly number[]> = {
  particlesysbone: [1],
};

const scoped = <T>(
  table: Record<string, T>,
  contextName: string,
  field: string,
): T | undefined => {
  const name = field.toLowerCase();

  return (
    table[`${contextName.toLowerCase()}/${name}`] ??
    table[`${lastContextSegment(contextName)}/${name}`]
  );
};

export const scopedReference = (
  contextName: string,
  field: string,
): readonly string[] | undefined =>
  scoped(SCOPED_REFERENCES, contextName, field);

export const namesTokenAt = (
  contextName: string,
  field: string,
  index: number,
): boolean => {
  const tokens =
    scoped(REFERENCE_TOKENS, contextName, field) ??
    REFERENCE_TOKENS[field.toLowerCase()];

  return tokens === undefined || tokens.includes(index);
};

export const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;

const KEYED_NAME_FIELDS: Record<string, string> = {
  fxevent: 'name:',
};

const OPTIONAL_MARKER_FIELDS: ReadonlySet<string> = new Set(['blingupgrades']);

export const nameOffsetIn = (
  field: string,
  values: readonly { text: string }[],
  index: number,
): number | undefined => {
  const name = field.toLowerCase();
  const text = values[index]?.text ?? '';
  const key = KEYED_NAME_FIELDS[name];

  if (key) {
    if (text.toLowerCase().startsWith(key)) {
      return text.length > key.length ? key.length : undefined;
    }

    return values[index - 1]?.text.toLowerCase() === key ? 0 : undefined;
  }

  if (OPTIONAL_MARKER_FIELDS.has(name) && text.startsWith('@')) {
    return text.length > 1 ? 1 : undefined;
  }

  return 0;
};
