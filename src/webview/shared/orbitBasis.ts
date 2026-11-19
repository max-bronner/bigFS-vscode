import type { Vec3 } from '../../formats/w3d/w3dPose';
import { cross } from './viewProjection';

export interface OrbitPlace {
  yaw: number;
  pitch: number;
  distance: number;
  target: Vec3;
}

export interface CameraBasis {
  eye: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v) || 1;

  return [v[0] / length, v[1] / length, v[2] / length];
};

export const computeOrbitBasis = ({
  yaw,
  pitch,
  distance,
  target,
}: OrbitPlace): CameraBasis => {
  const towardsEye: Vec3 = [
    Math.cos(pitch) * Math.cos(yaw),
    Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
  ];
  const forward = towardsEye.map((axis) => -axis) as Vec3;
  const right = normalize(cross(forward, [0, 0, 1]));

  return {
    eye: target.map((axis, at) => axis + towardsEye[at] * distance) as Vec3,
    forward,
    right,
    up: cross(right, forward),
  };
};
