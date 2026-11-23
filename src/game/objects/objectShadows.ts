export interface ShadowFields {
  style?: string;
  texture?: string;
  sizeX?: string;
  sizeY?: string;
  offsetX?: string;
  offsetY?: string;
  opacityStart?: string;
  opacityPeak?: string;
  fadeInTime?: string;
  sunAngle?: string;
  isDisabled?: boolean;
}

export type DecalBlend = 'multiply' | 'alpha' | 'additive';

export interface DecalShadow {
  kind: 'decal';
  blend: DecalBlend;
  texture: string;
  width: number;
  depth: number;
  offset: [number, number];
  opacity: number;
  fadeIn?: { from: number; milliseconds: number };
  isCustom: boolean;
}

export interface CastShadow {
  kind: 'cast';
  minSunAngle: number;
}

export type ObjectShadow = DecalShadow | CastShadow;

const FIELD_KEYS: ReadonlyMap<string, Exclude<keyof ShadowFields, 'isDisabled'>> = new Map([
  ['shadow', 'style'],
  ['shadowtexture', 'texture'],
  ['shadowsizex', 'sizeX'],
  ['shadowsizey', 'sizeY'],
  ['shadowoffsetx', 'offsetX'],
  ['shadowoffsety', 'offsetY'],
  ['shadowopacitystart', 'opacityStart'],
  ['shadowopacitypeak', 'opacityPeak'],
  ['shadowopacityfadeintime', 'fadeInTime'],
  ['shadowsunangle', 'sunAngle'],
] as const);
const DECAL_BLENDS: ReadonlyMap<string, DecalBlend> = new Map([
  ['SHADOW_DECAL', 'multiply'],
  ['SHADOW_ALPHA_DECAL', 'alpha'],
  ['SHADOW_ALPHA_DECAL_DYNAMIC', 'alpha'],
  ['SHADOW_ADDITIVE_DECAL', 'additive'],
  ['SHADOW_ADDITIVE_DECAL_DYNAMIC', 'additive'],
] as const);
const CAST_STYLE = /^SHADOW_(VOLUME|PROJECTION|DYNAMIC_PROJECTION|DIRECTIONAL_PROJECTION)/;
const BLOB_TEXTURE = 'shadow';
const STOCK_BLOB = /^(shadow|shadowi)(\.\w+)?$/i;
const MAX_OPACITY = 255;
const MAX_DECAL_SIZE = 10_000;

export const DEFAULT_SUN: [number, number, number] = [-0.6, 0.3, -0.75];

export const readShadowField = (
  fields: ShadowFields | undefined,
  key: string,
  value: string,
): ShadowFields | undefined => {
  if (key === 'shadowforcedisable') {
    return { ...fields, isDisabled: /^yes$/i.test(value) };
  }

  const name = FIELD_KEYS.get(key);

  return name && { ...fields, [name]: value.replace(/\/\/.*$/, '') };
};

export const resolveShadowMacros = (
  fields: ShadowFields,
  resolveMacro: (name: string) => string | undefined,
): void => {
  for (const key of FIELD_KEYS.values()) {
    const value = fields[key];

    if (value !== undefined) {
      fields[key] = resolveMacro(value) ?? value;
    }
  }
};

const toNumber = (text: string | undefined, fallback: number, limit: number) => {
  const value = Number.parseFloat(text ?? '');

  return Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : fallback;
};

const toShadow = (fields: ShadowFields): ObjectShadow | undefined => {
  const style = fields.style?.toUpperCase() ?? '';
  const blend = DECAL_BLENDS.get(style);

  if (CAST_STYLE.test(style)) {
    return { kind: 'cast', minSunAngle: Math.max(0, toNumber(fields.sunAngle, 0, 90)) };
  }
  if (!blend || (blend !== 'multiply' && !fields.texture)) {
    return undefined;
  }

  const toOpacity = (text: string | undefined, fallback: number) =>
    Math.max(0, toNumber(text, fallback, MAX_OPACITY)) / MAX_OPACITY;
  const milliseconds = toNumber(fields.fadeInTime, 0, 60_000);
  const size = (text: string | undefined) => Math.abs(toNumber(text, 0, MAX_DECAL_SIZE));
  const texture = fields.texture ?? BLOB_TEXTURE;

  return {
    kind: 'decal',
    blend,
    texture,
    isCustom: blend !== 'multiply' || !STOCK_BLOB.test(texture),
    width: size(fields.sizeX),
    depth: size(fields.sizeY),
    offset: [
      toNumber(fields.offsetX, 0, MAX_DECAL_SIZE),
      toNumber(fields.offsetY, 0, MAX_DECAL_SIZE),
    ],
    opacity: toOpacity(fields.opacityPeak, MAX_OPACITY),
    ...(style.endsWith('_DYNAMIC') && milliseconds > 0
      ? { fadeIn: { from: toOpacity(fields.opacityStart, 0), milliseconds } }
      : {}),
  };
};

export const pickShadow = (
  ofObject: ShadowFields | undefined,
  ofDefault: ShadowFields | undefined,
  ofState: ShadowFields | undefined,
  isBody: boolean,
): ObjectShadow | undefined => {
  if (ofObject?.isDisabled) {
    return undefined;
  }

  const own = toShadow({ ...ofDefault, ...ofState });

  if (own) {
    return own;
  }

  const shared = ofObject && toShadow(ofObject);

  return shared && (shared.kind === 'cast' || isBody) ? shared : undefined;
};

export const readSunDirection = (gameData: string): [number, number, number] => {
  const time = /^[ \t]*TimeOfDay[ \t]*=[ \t]*([A-Za-z]{1,20})/im.exec(gameData)?.[1] ?? 'Afternoon';
  const line = new RegExp(`^[ \\t]*TerrainLighting${time}LightPos[ \\t]*=([^\\r\\n;]*)`, 'im').exec(
    gameData,
  )?.[1];
  const [x, y, z] = ['X', 'Y', 'Z'].map((axis) =>
    Number.parseFloat(new RegExp(`${axis}:\\s*([-+.\\d]+)`, 'i').exec(line ?? '')?.[1] ?? ''),
  );

  return [x, y, z].every(Number.isFinite) && z < 0 ? [x, y, z] : DEFAULT_SUN;
};

export const getHeightPlane = (at: readonly number[]): [number, number, number, number] => [
  at[2],
  at[6],
  at[10],
  at[14],
];

export const computeGroundProjection = (
  [x, y, z]: readonly [number, number, number],
  minSunAngle = 0,
): number[] => {
  const across = Math.hypot(x, y);
  const down = Math.max(Math.abs(z), 1e-3);
  const lowest = Math.tan((Math.min(minSunAngle, 89.9) * Math.PI) / 180);
  const height = Math.max(down, across * lowest);

  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    x / height, y / height, 0, 0,
    0, 0, 0, 1,
  ];
};
