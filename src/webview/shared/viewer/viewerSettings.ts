import { isBoolean, isColour, isNullOr, isOneOf } from '../createPreviewSettings';
import type { SettingCheck, SettingRules } from '../createPreviewSettings';

export const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4];

export const SKIES: [string, string][] = [
  ['dark', '#1b1c1f'],
  ['day', '#7a8ea6'],
  ['black', '#000000'],
  ['light', '#c8c8c8'],
];

export interface ViewerSettings {
  isSettingsOpen: boolean;
  bones: boolean | null;
  boneNames: boolean;
  meshes: boolean;
  textures: boolean;
  boxes: boolean;
  grid: boolean;
  house: string;
  customHouse: string | null;
  lod: number | null;
  sky: string;
  speed: number;
  loop: boolean;
}

const isLevel: SettingCheck<number> = (value): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

const isHouseChoice: SettingCheck<string> = (value): value is string =>
  typeof value === 'string' && /^(none|custom|\d+)$/.test(value);

export const VIEWER_SECTION = 'viewer';

export const VIEWER_SETTINGS: SettingRules<ViewerSettings> = {
  isSettingsOpen: { fallback: false, check: isBoolean },
  bones: { fallback: null, check: isNullOr(isBoolean) },
  boneNames: { fallback: false, check: isBoolean },
  meshes: { fallback: true, check: isBoolean },
  textures: { fallback: true, check: isBoolean },
  boxes: { fallback: false, check: isBoolean },
  grid: { fallback: true, check: isBoolean },
  house: { fallback: '0', check: isHouseChoice },
  customHouse: { fallback: null, check: isNullOr(isColour) },
  lod: { fallback: null, check: isNullOr(isLevel) },
  sky: { fallback: SKIES[0][1], check: isColour },
  speed: { fallback: 1, check: isOneOf(SPEEDS) },
  loop: { fallback: true, check: isBoolean },
};
