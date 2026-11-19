import type { W3dBlend } from "../../formats/w3d/w3dMaterialTypes";

type BlendFactor =
  | "ZERO"
  | "ONE"
  | "SRC_ALPHA"
  | "SRC_COLOR"
  | "ONE_MINUS_SRC_ALPHA"
  | "ONE_MINUS_SRC_COLOR";

const BLEND_FACTORS: Record<Exclude<W3dBlend, "opaque">, [BlendFactor, BlendFactor]> = {
  alpha: ["SRC_ALPHA", "ONE_MINUS_SRC_ALPHA"],
  additive: ["ONE", "ONE"],
  multiply: ["ZERO", "SRC_COLOR"],
  addScaledByAlpha: ["ONE", "SRC_ALPHA"],
  addScaledByColor: ["ONE", "SRC_COLOR"],
  addInverseScaledByColor: ["ONE", "ONE_MINUS_SRC_COLOR"],
};

export const applyBlend = (
  gl: WebGLRenderingContext,
  blend: W3dBlend,
  writesDepth: boolean,
): void => {
  gl.depthMask(writesDepth);
  if (blend === "opaque") {
    gl.disable(gl.BLEND);
    return;
  }

  const [source, destination] = BLEND_FACTORS[blend];

  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl[source],
    gl[destination],
    blend === "alpha" ? gl.ONE : gl.ZERO,
    blend === "alpha" ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE,
  );
};
