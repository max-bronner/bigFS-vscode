type Vec3 = [number, number, number];

export type W3dFacing = "oriented" | "aligned";

export interface FacingCamera {
  eye: Vec3;
  backward: Vec3;
  up: Vec3;
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const normalize = (v: Vec3): Vec3 | undefined => {
  const length = Math.hypot(...v);

  return length > 1e-6 ? [v[0] / length, v[1] / length, v[2] / length] : undefined;
};

export const computeFacingAxes = (
  facing: W3dFacing,
  origin: Vec3,
  { eye, backward, up }: FacingCamera,
): [Vec3, Vec3, Vec3] => {
  const towards: Vec3 =
    facing === "oriented"
      ? [eye[0] - origin[0], eye[1] - origin[1], eye[2] - origin[2]]
      : backward;
  const x = normalize(towards) ?? [1, 0, 0];
  const y = normalize(cross(up, x)) ?? [0, 1, 0];

  return [x, y, cross(x, y)];
};

export const turnVertices = (
  stored: { positions: Float32Array; normals?: Float32Array },
  origin: Vec3,
  [x, y, z]: readonly [Vec3, Vec3, Vec3],
  positions: Float32Array,
  normals?: Float32Array,
): void => {
  const turn = (from: Float32Array, at: number, axis: number) =>
    from[at] * x[axis] + from[at + 1] * y[axis] + from[at + 2] * z[axis];

  for (let at = 0; at + 2 < positions.length; at += 3) {
    for (let axis = 0; axis < 3; axis++) {
      positions[at + axis] = origin[axis] + turn(stored.positions, at, axis);
      if (normals && stored.normals) {
        normals[at + axis] = turn(stored.normals, at, axis);
      }
    }
  }
};
