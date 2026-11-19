import type { Rgb, W3dTexture } from "./w3dMaterialChunks";
import type { W3dUvMapper } from "./w3dUvMapper";

export type W3dBlend =
  | "opaque"
  | "alpha"
  | "additive"
  | "multiply"
  | "addScaledByAlpha"
  | "addScaledByColor"
  | "addInverseScaledByColor";

export interface W3dVertexColourUse {
  ambient: boolean;
  diffuse: boolean;
  replacesLighting: boolean;
  multipliesResult: boolean;
  scale: Rgb;
  alphaScale: number;
}

export interface W3dSurface {
  blend: W3dBlend;
  alphaTest: boolean;
  depthCompare: number;
  depthWrite: boolean;
  twoSided: boolean;
  sortLevel: number;
  ambient: Rgb;
  diffuse: Rgb;
  emissive: Rgb;
  opacity: number;
  unlit: boolean;
  modulate2x: boolean;
  vertexColour?: W3dVertexColourUse;
  detailColor: number;
  detailAlpha: number;
  bumpOffset: boolean;
  specular: Rgb;
  shininess: number;
  bumpScale: number;
  houseColourable: boolean;
  mappers?: [W3dUvMapper, W3dUvMapper];
}

export interface W3dMaterialDraw {
  pass: number;
  indices?: Uint32Array;
  surface: W3dSurface;
  texture?: W3dTexture;
  detailTexture?: W3dTexture;
  normalMap?: string;
  uvs?: Float32Array;
  detailUvs?: Float32Array;
  colors?: Uint8Array;
}

export interface W3dMaterialGeometry {
  indices: Uint32Array;
  vertexCount: number;
  twoSided: boolean;
  sortLevel: number;
}

export const DEFAULT_SURFACE: W3dSurface = {
  blend: "opaque",
  alphaTest: false,
  depthCompare: 3,
  depthWrite: false,
  twoSided: false,
  sortLevel: 0,
  ambient: [1, 1, 1],
  diffuse: [1, 1, 1],
  emissive: [0, 0, 0],
  opacity: 1,
  unlit: false,
  modulate2x: false,
  detailColor: 0,
  detailAlpha: 0,
  bumpOffset: false,
  specular: [0, 0, 0],
  shininess: 1,
  bumpScale: 1,
  houseColourable: false,
};
