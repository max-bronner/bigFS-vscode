import { classifyBlend } from "./classifyBlend";
import { getIndices, groupTriangles } from "./groupTriangles";
import type { MaterialGroup } from "./groupTriangles";
import {
  readFxBool,
  readFxDiffuseTexture,
  readFxText,
  resolveFxColours,
} from "./resolveFxColours";
import { resolveVertexColour } from "./resolveVertexColour";
import type {
  W3dFxMaterial,
  W3dMaterialPass,
  W3dMeshMaterials,
  W3dShader,
  W3dVertexMaterial,
} from "./w3dMaterialChunks";
import { DEFAULT_SURFACE } from "./w3dMaterialTypes";
import type { W3dMaterialDraw, W3dMaterialGeometry, W3dSurface } from "./w3dMaterialTypes";
import { parseUvMapper } from "./w3dUvMapper";

export const MAX_PASSES_PER_MESH = 8;
export const MAX_DRAWS_PER_MESH = 256;

const MAX_SORT_LEVEL = 32;
const MAX_DEPTH_COMPARE = 7;

const EFFECT_BLENDS = new Set(["1,0", "2,5", "1,1"]);
const EFFECT_DETAIL_COLORS = new Set([0, 2, 8, 11, 12]);
const GRADIENT_DISABLE = 0;
const GRADIENT_MODULATE2X = 5;
const GRADIENT_BUMPENVMAP = 3;
const MAX_DETAIL_COLOR = 12;
const MAX_DETAIL_ALPHA = 3;

const NO_ID = 0xffffffff;

const EMPTY_PASS: W3dMaterialPass = {
  vertexMaterialIds: [],
  shaderIds: [],
  fxMaterialIds: [],
  stages: [],
};

const resolveFxSurface = (material: W3dFxMaterial | undefined) => ({
  blend: readFxBool(material, "alphablendingenable") ? ("alpha" as const) : ("opaque" as const),
  alphaTest: readFxBool(material, "alphatestenable"),
});

const isEffectPath = (materials: W3dMeshMaterials, shader: W3dShader | undefined) =>
  shader !== undefined &&
  materials.passes.length === 1 &&
  materials.vertexMaterials.length === 1 &&
  EFFECT_BLENDS.has(`${shader.srcBlend},${shader.destBlend}`) &&
  shader.detailAlpha === 0 &&
  shader.primaryGradient <= 1 &&
  EFFECT_DETAIL_COLORS.has(shader.detailColor) &&
  shader.depthCompare === 3;

const isHouseColourable = (materials: W3dMeshMaterials, fxMaterial: W3dFxMaterial | undefined) =>
  fxMaterial
    ? fxMaterial.shaderName.toLowerCase() === "defaultw3d.fx" && !readFxText(fxMaterial, "normalmap")
    : materials.passes.length === 1;

const resolveColours = ({ ambient, diffuse, emissive, opacity }: W3dVertexMaterial) => ({
  ambient,
  diffuse,
  emissive,
  opacity,
});

const resolveMappers = ({
  attributes,
  mapperArgs0,
  mapperArgs1,
}: W3dVertexMaterial): W3dSurface["mappers"] => {
  const first = (attributes >>> 16) & 0xff;
  const second = (attributes >>> 8) & 0xff;

  return first || second
    ? [parseUvMapper(first, mapperArgs0), parseUvMapper(second, mapperArgs1)]
    : undefined;
};

const resolveDraw = (
  materials: W3dMeshMaterials,
  pass: W3dMaterialPass,
  passIndex: number,
  group: MaterialGroup,
  geometry: W3dMaterialGeometry,
): W3dMaterialDraw => {
  const shader =
    materials.shaders[group.shader ?? -1] ??
    materials.shaders[pass.shaderIds.find((id) => id !== NO_ID) ?? -1];
  const fxMaterial = materials.fxMaterials[group.fxMaterial ?? 0];
  const [stage, detailStage] = pass.stages;
  const uvs = stage?.uvs?.length ? stage.uvs : pass.uvs;
  const detailUvs = detailStage?.uvs?.length ? detailStage.uvs : uvs;
  const detailTexture = materials.textures[group.detailTexture ?? -1];
  const fitsVertices = (array: Float32Array | undefined) =>
    array?.length === geometry.vertexCount * 2 ? array : undefined;
  const legacyTexture = materials.textures[group.texture ?? -1];
  const fxTexture = fxMaterial && readFxDiffuseTexture(fxMaterial);
  const texture =
    legacyTexture ??
    (fxTexture ? { name: fxTexture, clampU: false, clampV: false } : undefined);
  const vertexMaterial = materials.vertexMaterials[group.vertexMaterial ?? -1];
  const colours = {
    ...(vertexMaterial ? resolveColours(vertexMaterial) : DEFAULT_SURFACE),
    ...(fxMaterial && resolveFxColours(fxMaterial)),
  };
  const isEffect = isEffectPath(materials, shader);
  const colors =
    pass.colors?.length === geometry.vertexCount * 4 ? pass.colors : undefined;

  return {
    pass: passIndex,
    indices: getIndices(group, geometry.indices),
    surface: {
      ...DEFAULT_SURFACE,
      ...colours,
      twoSided: geometry.twoSided,
      unlit:
        shader?.primaryGradient === GRADIENT_DISABLE ||
        fxMaterial?.shaderName.toLowerCase() === "simple.fx",
      modulate2x:
        !isEffect && !!texture && shader?.primaryGradient === GRADIENT_MODULATE2X,
      vertexColour: colors && resolveVertexColour(isEffect, colours),
      detailColor:
        detailTexture && shader && shader.detailColor <= MAX_DETAIL_COLOR ? shader.detailColor : 0,
      detailAlpha:
        detailTexture && shader && shader.detailAlpha <= MAX_DETAIL_ALPHA ? shader.detailAlpha : 0,
      bumpOffset: shader?.primaryGradient === GRADIENT_BUMPENVMAP,
      houseColourable: isHouseColourable(materials, fxMaterial),
      mappers: vertexMaterial && resolveMappers(vertexMaterial),
      sortLevel:
        geometry.sortLevel > 0 && geometry.sortLevel <= MAX_SORT_LEVEL ? geometry.sortLevel : 0,
      ...(shader
        ? {
            blend: classifyBlend(shader),
            alphaTest: shader.alphaTest !== 0,
            depthCompare: Math.min(shader.depthCompare, MAX_DEPTH_COMPARE),
            depthWrite: shader.depthMask !== 0,
          }
        : resolveFxSurface(fxMaterial)),
    },
    texture,
    detailTexture,
    normalMap: fxMaterial && readFxText(fxMaterial, "normalmap"),
    uvs: fitsVertices(uvs),
    detailUvs: fitsVertices(detailUvs),
    colors,
  };
};

export const resolveMaterialDraws = (
  materials: W3dMeshMaterials,
  geometry: W3dMaterialGeometry,
): W3dMaterialDraw[] => {
  const passes = materials.passes.length
    ? materials.passes.slice(0, MAX_PASSES_PER_MESH)
    : [EMPTY_PASS];
  const resolveAll = (isSplit: boolean) =>
    passes.flatMap((pass, passIndex) =>
      groupTriangles(pass, geometry, materials, isSplit).map((group) =>
        resolveDraw(materials, pass, passIndex, group, geometry),
      ),
    );
  const draws = resolveAll(true);

  return draws.length > MAX_DRAWS_PER_MESH ? resolveAll(false) : draws;
};
