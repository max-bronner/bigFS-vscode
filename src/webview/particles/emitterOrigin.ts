import type { Vec3 } from '../../formats/particles/particleDef';

export const attachment = {
  bone: [0, 0, 0] as Vec3,
};

let modelOrigin: Vec3 = [0, 0, 0];

export const setModelOrigin = (origin: Vec3): void => {
  modelOrigin = origin;
};

export const getModelOrigin = (): Vec3 => [...modelOrigin];

export const getRootOrigin = (): Vec3 =>
  getModelOrigin().map((value, axis) => value + attachment.bone[axis]) as Vec3;
