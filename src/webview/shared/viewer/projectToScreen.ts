import type { Vec3 } from '../../../formats/w3d/w3dPose';

export const projectToScreen = (
  matrix: ArrayLike<number>,
  [x, y, z]: Vec3,
  width: number,
  height: number,
): [number, number] | undefined => {
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];

  if (w <= 0) {
    return undefined;
  }

  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];

  return [((clipX / w + 1) / 2) * width, ((1 - clipY / w) / 2) * height];
};
