import { SPEEDS, ZOOMS } from './protocol';
import type { AptToolbar } from './protocol';

export const DEFAULT_TOOLBAR: AptToolbar = {
  zoom: 'fit',
  speed: 1,
  origin: false,
  boxes: false,
  masks: true,
  scripts: true,
  interact: false,
  wireframe: false,
};

const SWITCHES = ['origin', 'boxes', 'masks', 'scripts', 'interact', 'wireframe'] as const;

export const readToolbar = (kept: unknown): AptToolbar => {
  const read = (kept ?? {}) as Partial<Record<keyof AptToolbar, unknown>>;
  const toolbar = { ...DEFAULT_TOOLBAR };

  if (typeof read.zoom === 'string' && ZOOMS.includes(read.zoom)) {
    toolbar.zoom = read.zoom;
  }
  if (typeof read.speed === 'number' && SPEEDS.includes(read.speed)) {
    toolbar.speed = read.speed;
  }
  for (const key of SWITCHES) {
    if (typeof read[key] === 'boolean') {
      toolbar[key] = read[key];
    }
  }
  return toolbar;
};
