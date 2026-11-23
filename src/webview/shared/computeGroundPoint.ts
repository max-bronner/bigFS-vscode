import type { Vec3 } from '../../formats/w3d/w3dPose';
import { FOCAL_LENGTH } from './orbitBasis';
import type { CameraBasis } from './orbitBasis';

const HORIZON = 60;

export const computeGroundPoint = (
  { eye, forward, right, up }: CameraBasis,
  [x, y]: readonly [number, number],
  aspect: number,
): Vec3 | undefined => {
  const ray = forward.map(
    (axis, at) =>
      axis + right[at] * ((x * aspect) / FOCAL_LENGTH) + up[at] * (y / FOCAL_LENGTH),
  );
  const distance = -eye[2] / ray[2];

  return Number.isFinite(distance) &&
    distance > 0 &&
    distance * Math.hypot(...ray) <= Math.abs(eye[2]) * HORIZON
    ? [eye[0] + ray[0] * distance, eye[1] + ray[1] * distance, 0]
    : undefined;
};
