import { isBoolean } from '../shared/createPreviewSettings';
import type { SettingRules } from '../shared/createPreviewSettings';
import type { MapLayers } from './state';

export const LAYER_SECTION = 'layers';

export const LAYER_SETTINGS: SettingRules<MapLayers> = {
  objects: { fallback: true, check: isBoolean },
  waypoints: { fallback: true, check: isBoolean },
  links: { fallback: true, check: isBoolean },
  starts: { fallback: true, check: isBoolean },
  boundary: { fallback: true, check: isBoolean },
  areas: { fallback: true, check: isBoolean },
};
