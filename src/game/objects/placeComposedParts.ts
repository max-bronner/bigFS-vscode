import { poseAt } from '../../formats/w3d/w3dPose';
import type { BoneTransform, Pose, Vec3 } from '../../formats/w3d/w3dPose';
import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import type { PartPlacement } from './objectComposition';

export type Matrix4 = number[];

export interface PlacedModel {
  matrix: Matrix4;
  skeleton?: SceneSkeleton;
  pose?: Pose;
}

export const IDENTITY: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const MAX_NUMBERED_BONES = 99;

export const toTranslation = ([x, y, z]: Vec3): Matrix4 => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1,
];

export const multiplyMatrices = (a: Matrix4, b: Matrix4): Matrix4 => {
  const out = new Array<number>(16);

  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;

      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[column * 4 + k];
      }
      out[column * 4 + row] = sum;
    }
  }
  return out;
};

export const toBoneMatrix = ({ t, q: [x, y, z, w] }: BoneTransform): Matrix4 => [
  1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
  2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
  2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
  t[0], t[1], t[2], 1,
];

export const invertAffine = (m: Matrix4): Matrix4 | undefined => {
  const a = (row: number, column: number) => m[column * 4 + row];
  const cofactor = (r0: number, r1: number, c0: number, c1: number) =>
    a(r0, c0) * a(r1, c1) - a(r0, c1) * a(r1, c0);
  const adjugate = [
    [cofactor(1, 2, 1, 2), -cofactor(0, 2, 1, 2), cofactor(0, 1, 1, 2)],
    [-cofactor(1, 2, 0, 2), cofactor(0, 2, 0, 2), -cofactor(0, 1, 0, 2)],
    [cofactor(1, 2, 0, 1), -cofactor(0, 2, 0, 1), cofactor(0, 1, 0, 1)],
  ];
  const determinant =
    a(0, 0) * adjugate[0][0] + a(0, 1) * adjugate[1][0] + a(0, 2) * adjugate[2][0];

  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12) {
    return undefined;
  }

  const linear = adjugate.map((row) => row.map((value) => value / determinant));
  const moved = linear.map(
    (row) => -(row[0] * a(0, 3) + row[1] * a(1, 3) + row[2] * a(2, 3)),
  );

  return [
    linear[0][0], linear[1][0], linear[2][0], 0,
    linear[0][1], linear[1][1], linear[2][1], 0,
    linear[0][2], linear[1][2], linear[2][2], 0,
    moved[0], moved[1], moved[2], 1,
  ];
};

const toTurn = (angle: number): Matrix4 => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
};

const bindPoses = new WeakMap<SceneSkeleton, Pose>();
const getBindPose = (skeleton: SceneSkeleton) => {
  let pose = bindPoses.get(skeleton);

  if (!pose) {
    pose = poseAt(skeleton);
    bindPoses.set(skeleton, pose);
  }
  return pose;
};

const findBone = (names: readonly string[], name: string) =>
  names.findIndex((each) => each.toLowerCase() === name.toLowerCase());

export const listPassengerBones = (names: readonly string[], prefix: string): number[] => {
  const found: number[] = [];

  for (let number = 1; number <= MAX_NUMBERED_BONES; number++) {
    const at = findBone(names, `${prefix}${String(number).padStart(2, '0')}`);

    if (at < 0) {
      break;
    }
    found.push(at);
  }
  if (!found.length) {
    const bare = findBone(names, prefix);

    return bare < 0 ? [] : [bare];
  }
  return found;
};

export const placePart = (
  placement: PartPlacement,
  owner: PlacedModel,
  attachModels: readonly SceneSkeleton[] = [],
): Matrix4 | undefined => {
  switch (placement.kind) {
    case 'origin':
      return owner.matrix;
    case 'slot':
      return multiplyMatrices(owner.matrix, toTranslation([placement.x, placement.y, 0]));
    case 'attachBone': {
      for (const skeleton of [owner.skeleton, ...attachModels]) {
        const at = skeleton ? findBone(skeleton.names, placement.bone) : -1;

        if (skeleton && at >= 0) {
          return multiplyMatrices(owner.matrix, toTranslation(getBindPose(skeleton).world[at].t));
        }
      }
      return owner.matrix;
    }
    case 'passengerBone': {
      const skeleton = owner.skeleton;
      const bones = skeleton ? listPassengerBones(skeleton.names, placement.prefix) : [];

      if (!skeleton || !bones.length) {
        return undefined;
      }

      const bone = bones[placement.slot % bones.length];
      const rest = toBoneMatrix(getBindPose(skeleton).world[bone]);
      const posed = owner.pose?.world[bone];
      const motion = posed && invertAffine(rest);
      const seat = multiplyMatrices(
        toTranslation([rest[12], rest[13], rest[14]]),
        toTurn(Math.atan2(rest[1], rest[0])),
      );

      return multiplyMatrices(
        owner.matrix,
        motion ? multiplyMatrices(multiplyMatrices(toBoneMatrix(posed), motion), seat) : seat,
      );
    }
  }
};
