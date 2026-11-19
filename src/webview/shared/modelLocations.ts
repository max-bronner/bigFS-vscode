export type UniformLookup = (name: string) => WebGLUniformLocation | null;

export interface ModelAttributes {
  position: number;
  normal: number;
  uv: number;
  detailUv: number;
  color: number;
}

export interface ModelLocations {
  uniform: UniformLookup;
  attributes: ModelAttributes;
}
