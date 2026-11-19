import type { Rgb, W3dFxMaterial } from "./w3dMaterialChunks";
import { DEFAULT_SURFACE } from "./w3dMaterialTypes";

export const readFxBool = (material: W3dFxMaterial | undefined, name: string) =>
  material?.properties.get(name) === true;

export const readFxColour = ({ properties }: W3dFxMaterial, name: string): Rgb | undefined => {
  const value = properties.get(name);

  return Array.isArray(value) && value.length >= 3 ? [value[0], value[1], value[2]] : undefined;
};

export const readFxNumber = ({ properties }: W3dFxMaterial, name: string): number | undefined => {
  const value = properties.get(name);

  return typeof value === "number" ? value : undefined;
};

export const readFxText = ({ properties }: W3dFxMaterial, name: string): string | undefined => {
  const value = properties.get(name);

  return typeof value === "string" ? value : undefined;
};

export const readFxDiffuseTexture = (material: W3dFxMaterial): string | undefined =>
  readFxText(material, "diffusetexture") ?? readFxText(material, "texture_0");

export const resolveFxColours = (material: W3dFxMaterial) => ({
  diffuse: readFxColour(material, "diffusecolor") ?? DEFAULT_SURFACE.diffuse,
  specular: readFxColour(material, "specularcolor") ?? DEFAULT_SURFACE.specular,
  shininess: readFxNumber(material, "specularexponent") ?? DEFAULT_SURFACE.shininess,
  bumpScale: readFxNumber(material, "bumpscale") ?? DEFAULT_SURFACE.bumpScale,
});
