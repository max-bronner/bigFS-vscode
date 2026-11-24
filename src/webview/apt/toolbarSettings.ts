import { isBoolean, isOneOf } from '../shared/createPreviewSettings';
import type { SettingRules } from '../shared/createPreviewSettings';
import { SPEEDS, ZOOMS } from './protocol';
import type { AptToolbar } from './protocol';

export const TOOLBAR_SECTION = 'toolbar';

export const TOOLBAR_SETTINGS: SettingRules<AptToolbar> = {
  zoom: { fallback: 'fit', check: isOneOf(ZOOMS) },
  speed: { fallback: 1, check: isOneOf(SPEEDS) },
  origin: { fallback: false, check: isBoolean },
  boxes: { fallback: false, check: isBoolean },
  masks: { fallback: true, check: isBoolean },
  scripts: { fallback: true, check: isBoolean },
  interact: { fallback: false, check: isBoolean },
  wireframe: { fallback: false, check: isBoolean },
};
