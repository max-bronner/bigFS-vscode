import type { W3dShader } from "./w3dMaterialChunks";
import type { W3dBlend } from "./w3dMaterialTypes";

export const classifyBlend = (shader: W3dShader): W3dBlend => {
  const { srcBlend, destBlend, alphaTest, depthMask } = shader;

  if (destBlend === 0) {
    return "opaque";
  }
  if (destBlend === 1) {
    return "additive";
  }
  if (alphaTest && depthMask) {
    return "opaque";
  }
  if (srcBlend === 0 && destBlend === 2) {
    return "multiply";
  }
  if (srcBlend === 1 && destBlend === 2) {
    return "addScaledByColor";
  }
  if (srcBlend === 1 && destBlend === 3) {
    return "addInverseScaledByColor";
  }
  return srcBlend === 1 && destBlend === 4 ? "addScaledByAlpha" : "alpha";
};
