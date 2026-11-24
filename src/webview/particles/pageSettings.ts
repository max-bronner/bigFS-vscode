import { DETAIL_LEVELS } from '../../game/objects/detailModels';
import type { DetailLevel } from '../../game/objects/detailModels';
import { isBoolean, isColour, isOneOf } from '../shared/createPreviewSettings';
import type { SettingRules } from '../shared/createPreviewSettings';

export interface ParticlePageSettings {
  shadows: boolean;
  groundColour: string;
  move: boolean;
  detail: DetailLevel;
  emitterShapes: boolean;
}

export const PARTICLE_PAGE_SECTION = 'page';

export const PARTICLE_PAGE_SETTINGS: SettingRules<ParticlePageSettings> = {
  shadows: { fallback: false, check: isBoolean },
  groundColour: { fallback: '#5c5c57', check: isColour },
  move: { fallback: false, check: isBoolean },
  detail: { fallback: 'high', check: isOneOf(DETAIL_LEVELS) },
  emitterShapes: { fallback: false, check: isBoolean },
};
