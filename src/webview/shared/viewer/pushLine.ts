import type { Vec3 } from '../../../formats/w3d/w3dPose';

export type LineColor = [number, number, number, number];

export const pushLine = (
  out: number[],
  a: Vec3,
  b: Vec3,
  color: LineColor,
): void => {
  out.push(...a, ...color, ...b, ...color);
};
