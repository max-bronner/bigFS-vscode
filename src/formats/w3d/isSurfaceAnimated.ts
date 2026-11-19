import type { W3dSurface } from "./w3dMaterialTypes";
import { isUvMapperAnimated } from "./w3dUvMapper";

export const isSurfaceAnimated = ({ mappers }: W3dSurface): boolean =>
  !!mappers?.some(isUvMapperAnimated);
