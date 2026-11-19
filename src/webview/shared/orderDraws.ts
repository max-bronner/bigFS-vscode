import type { W3dBlend } from "../../formats/w3d/w3dMaterialTypes";

interface OrderedDraw {
  blend: W3dBlend;
  sortLevel: number;
}

export const orderDraws = <T extends OrderedDraw>(draws: readonly T[]): T[] => [
  ...draws.filter(({ blend }) => blend === "opaque"),
  ...draws
    .filter(({ blend }) => blend !== "opaque")
    .sort((a, b) => a.sortLevel - b.sortLevel),
];
