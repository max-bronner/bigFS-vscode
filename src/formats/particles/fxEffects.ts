import type { SageToken } from '../ini/sageIniParser';
import type { Range, Vec3 } from './particleIni';

export type FxApproximation =
  | {
      type: 'shake';
      seconds: number;
      degrees: number;
    }
  | {
      type: 'flash';
      color: Vec3;
      rise: number;
      fall: number;
    }
  | { type: 'scorch'; radius: number };

export interface FxEffect {
  slot: string;
  module: number;
  initialDelay: Range;
  detail: string;
  approximation?: FxApproximation;
}

type Fields = Map<string, SageToken[]>;

type ParseNumber = (text: string) => number;

const numberAt = (
  fields: Fields,
  key: string,
  fallback: number,
  parse: ParseNumber,
): number => {
  const number = parse(fields.get(key)?.[0]?.text ?? '');

  return isNaN(number) ? fallback : number;
};

const textAt = (fields: Fields, key: string): string | undefined =>
  fields.get(key)?.[0]?.text;

const colorAt = (fields: Fields, key: string, parse: ParseNumber): Vec3 => {
  const values = fields.get(key) ?? [];
  const channels = values.slice(0, 3).map((value) => parse(value.text));

  return channels.length === 3 && channels.every((value) => !isNaN(value))
    ? (channels.map((value) => Math.min(1, Math.max(0, value / 255))) as Vec3)
    : [1, 1, 1];
};

const SHAKE_DEGREES: Record<string, number> = {
  subtle: 0.3,
  normal: 0.8,
  strong: 1.6,
  severe: 3,
  cine_extreme: 5,
  cine_insane: 8,
};

const SHAKE_SECONDS = 0.6;
const DEFAULT_SCORCH_RADIUS = 20;

const describe = (fields: Fields, keys: string[]): string =>
  keys
    .flatMap((key) => {
      const values = fields.get(key.toLowerCase());

      return values?.length
        ? [`${key} ${values.map((value) => value.text).join(' ')}`]
        : [];
    })
    .join(', ');

const DETAIL_KEYS: Record<string, string[]> = {
  fxlistatbonepos: ['FX', 'BoneName'],
  buffnugget: ['BuffType', 'BuffThingTemplate', 'BuffLifeTime'],
  attachedmodel: ['Modelname', 'ExpireTimer'],
  model: ['Modelname', 'ExpireTimer'],
  tracer: ['Length', 'Width', 'Speed'],
  tracerfx: ['Length', 'Width', 'Speed'],
  dynamicdecal: ['DecalName', 'Size', 'Lifetime'],
  tintdrawable: ['Color', 'Frequency'],
  evaevent: ['Name'],
  lightpulse: ['Color', 'Radius', 'IncreaseTime', 'DecreaseTime'],
  terrainscorch: ['Type', 'Radius'],
  viewshake: ['Type'],
  camerashakervolume: ['Radius', 'Duration_Seconds', 'Amplitude_Degrees'],
};

export const readFxEffect = (
  slot: string,
  module: number,
  fields: Fields,
  initialDelay: Range,
  parse: ParseNumber,
): FxEffect => {
  const kind = slot.toLowerCase();
  const detail = describe(fields, DETAIL_KEYS[kind] ?? []);
  const base = { slot, module, initialDelay, detail };

  if (kind === 'viewshake') {
    const type = (textAt(fields, 'type') ?? 'normal').toLowerCase();

    return {
      ...base,
      approximation: {
        type: 'shake',
        seconds: SHAKE_SECONDS,
        degrees: SHAKE_DEGREES[type] ?? SHAKE_DEGREES.normal,
      },
    };
  }
  if (kind === 'camerashakervolume') {
    return {
      ...base,
      approximation: {
        type: 'shake',
        seconds: Math.max(0, numberAt(fields, 'duration_seconds', 1, parse)),
        degrees: Math.max(0, numberAt(fields, 'amplitude_degrees', 1, parse)),
      },
    };
  }
  if (kind === 'lightpulse') {
    const rise = Math.max(0, numberAt(fields, 'increasetime', 0, parse));
    const fall = Math.max(0, numberAt(fields, 'decreasetime', 0, parse));

    return {
      ...base,
      approximation: {
        type: 'flash',
        color: colorAt(fields, 'color', parse),
        rise,
        fall: rise + fall === 0 ? 300 : fall,
      },
    };
  }
  if (kind === 'terrainscorch') {
    return {
      ...base,
      approximation: {
        type: 'scorch',
        radius: Math.max(
          1,
          numberAt(fields, 'radius', DEFAULT_SCORCH_RADIUS, parse),
        ),
      },
    };
  }
  return base;
};

export interface FxEffectState {
  shake: number;
  flash?: { color: Vec3; alpha: number };
  scorches: number[];
}

const FLASH_PEAK = 0.45;

export const effectsAt = (
  effects: readonly FxEffect[],
  frame: number,
  hz: number,
): FxEffectState => {
  const now = (frame / hz) * 1000;
  const state: FxEffectState = { shake: 0, scorches: [] };

  for (const effect of effects) {
    const approximation = effect.approximation;
    const elapsed = now - effect.initialDelay.low;

    if (!approximation || elapsed < 0) {
      continue;
    }
    if (approximation.type === 'shake') {
      const length = approximation.seconds * 1000;

      if (elapsed < length) {
        const falloff = 1 - elapsed / length;

        state.shake +=
          approximation.degrees * falloff * Math.sin(elapsed * 0.045);
      }
    } else if (approximation.type === 'flash') {
      const { rise, fall } = approximation;
      const alpha =
        elapsed < rise
          ? elapsed / rise
          : elapsed < rise + fall
            ? 1 - (elapsed - rise) / fall
            : 0;

      if (alpha > 0 && alpha * FLASH_PEAK > (state.flash?.alpha ?? 0)) {
        state.flash = { color: approximation.color, alpha: alpha * FLASH_PEAK };
      }
    } else {
      state.scorches.push(approximation.radius);
    }
  }
  return state;
};

export const effectLength = (effect: FxEffect): number => {
  const approximation = effect.approximation;

  return approximation?.type === 'shake'
    ? approximation.seconds * 1000
    : approximation?.type === 'flash'
      ? approximation.rise + approximation.fall
      : 0;
};
