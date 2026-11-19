import type { Vec3 } from '../../formats/particles/particleDef';
import { $, viewer } from './page';

export const attachment = {
  bone: [0, 0, 0] as Vec3,
};

export const getModelOrigin = (): Vec3 => {
  const motion = $<HTMLSelectElement>('motion').value;
  const t = viewer.getTime();

  if (motion === 'circle') {
    return [Math.cos(t * 1.5) * 60, Math.sin(t * 1.5) * 60, 0];
  }
  if (motion === 'line') {
    return [Math.sin(t * 1.2) * 80, 0, 0];
  }
  return [0, 0, 0];
};

export const getRootOrigin = (): Vec3 =>
  getModelOrigin().map((value, axis) => value + attachment.bone[axis]) as Vec3;
