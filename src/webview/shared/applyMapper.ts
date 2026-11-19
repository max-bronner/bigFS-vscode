import { IDENTITY_UV_TRANSFORM, sampleUvTransform } from "../../formats/w3d/w3dUvMapper";
import type { W3dUvMapper } from "../../formats/w3d/w3dUvMapper";
import type { UniformLookup } from "./modelLocations";

interface MapperUniforms {
  linear: string;
  offset: string;
  generated: string;
}

export const UV_UNIFORMS: MapperUniforms = {
  linear: "uvLinear",
  offset: "uvOffset",
  generated: "uvGenerated",
};

export const DETAIL_UV_UNIFORMS: MapperUniforms = {
  linear: "detailUvLinear",
  offset: "detailUvOffset",
  generated: "detailUvGenerated",
};

export const applyMapper = (
  gl: WebGLRenderingContext,
  uniform: UniformLookup,
  uniforms: MapperUniforms,
  mapper: W3dUvMapper | undefined,
  seconds: number,
  hasNormals: boolean,
): void => {
  const { linear, offset } = mapper
    ? sampleUvTransform(mapper, seconds)
    : IDENTITY_UV_TRANSFORM;

  gl.uniform4fv(uniform(uniforms.linear), linear);
  gl.uniform2fv(uniform(uniforms.offset), offset);
  gl.uniform1i(uniform(uniforms.generated), hasNormals && mapper ? mapper.type : 0);
};
