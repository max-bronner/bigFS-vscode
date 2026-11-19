import type { W3dBlend, W3dSurface } from "./w3dMaterialTypes";

const BLEND_RANK: W3dBlend[] = [
  "opaque",
  "multiply",
  "addInverseScaledByColor",
  "addScaledByColor",
  "addScaledByAlpha",
  "alpha",
  "additive",
];

export const pickMeshBlend = (surfaces: readonly W3dSurface[]): W3dBlend =>
  surfaces.reduce<W3dBlend>(
    (best, { blend }) =>
      BLEND_RANK.indexOf(blend) > BLEND_RANK.indexOf(best) ? blend : best,
    "opaque",
  );
