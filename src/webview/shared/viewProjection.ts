import type { Vec3 } from '../../formats/w3d/w3dPose';

export interface CameraLens {
  eye: Vec3;
  towardsEye: Vec3;
  up: Vec3;
  focalLength: number;
  aspect: number;
  near: number;
  far: number;
}

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v) || 1;

  return [v[0] / length, v[1] / length, v[2] / length];
};

export const composeViewProjection = ({
  eye,
  towardsEye: z,
  up,
  focalLength: f,
  aspect,
  near,
  far,
}: CameraLens): Float32Array => {
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  const view = [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ];
  const projection = [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ];
  const out = new Float32Array(16);

  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        out[column * 4 + row] += projection[k * 4 + row] * view[column * 4 + k];
      }
    }
  }
  return out;
};
