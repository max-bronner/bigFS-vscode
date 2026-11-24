import { DETAIL_LEVELS } from '../../game/objects/detailModels';
import type { DetailLevel } from '../../game/objects/detailModels';
import { isNullOr, isOneOf } from '../shared/createPreviewSettings';
import type { SettingCheck, SettingRules } from '../shared/createPreviewSettings';

export interface TextureSettings {
  zoom: number;
  channels: 'rgba' | 'rgb' | 'alpha' | null;
  background: 'checker' | 'black' | 'white';
  panelWidth: number | null;
}

export interface ModelPageSettings {
  foldedSections: string[];
  detail: DetailLevel;
}

export const MAX_ZOOM = 32;

const isZoom: SettingCheck<number> = (value): value is number =>
  value === 0 || (typeof value === 'number' && value >= 1 / MAX_ZOOM && value <= MAX_ZOOM);

const isWidth: SettingCheck<number> = (value): value is number =>
  typeof value === 'number' && value > 0 && Number.isFinite(value);

const isSectionList: SettingCheck<string[]> = (value): value is string[] =>
  Array.isArray(value) && value.every((key) => typeof key === 'string');

export const TEXTURE_SECTION = 'texture';

export const TEXTURE_SETTINGS: SettingRules<TextureSettings> = {
  zoom: { fallback: 0, check: isZoom },
  channels: { fallback: null, check: isNullOr(isOneOf(['rgba', 'rgb', 'alpha'] as const)) },
  background: { fallback: 'checker', check: isOneOf(['checker', 'black', 'white'] as const) },
  panelWidth: { fallback: null, check: isNullOr(isWidth) },
};

export const MODEL_PAGE_SECTION = 'modelPage';

export const MODEL_PAGE_SETTINGS: SettingRules<ModelPageSettings> = {
  foldedSections: { fallback: [], check: isSectionList },
  detail: { fallback: 'high', check: isOneOf(DETAIL_LEVELS) },
};
