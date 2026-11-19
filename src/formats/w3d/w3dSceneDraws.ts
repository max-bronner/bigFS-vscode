import type { ToolBox } from "../../core/toolRegistry";
import { decodeDdsTool, decodeTgaTool } from "../texture/textureTools";
import type { RgbaImage } from "../texture/textureTools";
import { buildBumpOffsets } from "./w3dBumpMap";
import { HOUSE_COLOR_INI, parseHouseColours } from "./w3dHouseColour";
import type { W3dTexture } from "./w3dMaterialChunks";
import type { W3dMaterialDraw } from "./w3dMaterialTypes";
import type { W3dMesh } from "./w3dTools";

export interface SceneDraw
  extends Omit<W3dMaterialDraw, "texture" | "detailTexture" | "normalMap"> {
  texture?: number;
  textured: boolean;
  detailTexture?: number;
  normalMap?: number;
  houseMask?: number;
}

export interface SceneTextureAddressing {
  clampU: boolean;
  clampV: boolean;
}

export type LoadFile = (fileName: string) => Promise<Uint8Array | undefined>;

export type DecodePng = (bytes: Uint8Array) => RgbaImage;

export interface SceneDraws {
  textures: RgbaImage[];
  addressing: SceneTextureAddressing[];
  missing: string[];
  draws: SceneDraw[][];
  uvs: (Float32Array | undefined)[];
}

const flipV = (uvs: Float32Array): Float32Array =>
  uvs.map((value, index) => (index % 2 ? 1 - value : value));

const removeExtension = (fileName: string): string => fileName.replace(/\.[^.]*$/, "");

const loadTexture = async (
  name: string,
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<RgbaImage | undefined> => {
  for (const [extension, tool] of [
    [".dds", decodeDdsTool],
    [".tga", decodeTgaTool],
  ] as const) {
    const bytes = await loadFile(`${removeExtension(name)}${extension}`);

    if (bytes) {
      try {
        return (await tools.use(tool)(bytes)).levels[0];
      } catch {
      }
    }
  }

  return undefined;
};

const loadMask = async (
  name: string,
  loadFile: LoadFile,
  tools: ToolBox,
  decodePng: DecodePng | undefined,
): Promise<RgbaImage | undefined> => {
  const image = await loadTexture(name, loadFile, tools);
  const bytes = !image && decodePng && (await loadFile(`${removeExtension(name)}.png`));

  try {
    return bytes ? decodePng?.(bytes) : image;
  } catch {
    return undefined;
  }
};

interface TextureUse extends W3dTexture {
  isBumpMap?: boolean;
}

const getUseKey = ({ name, clampU, clampV, isBumpMap }: TextureUse) =>
  `${name}|${clampU}|${clampV}|${!!isBumpMap}`;

const getBaseUse = ({ texture, surface }: W3dMaterialDraw): TextureUse | undefined =>
  texture && { ...texture, isBumpMap: surface.bumpOffset };

const getNormalMapUse = ({ normalMap }: W3dMaterialDraw): TextureUse | undefined =>
  normalMap ? { name: normalMap, clampU: false, clampV: false } : undefined;

const getUses = (draw: W3dMaterialDraw): TextureUse[] =>
  [getBaseUse(draw), draw.detailTexture, getNormalMapUse(draw)].flatMap((use) =>
    use ? [use] : [],
  );

export const MAX_TEXTURE_NAMES = 256;

const loadHouseColours = async (meshes: readonly W3dMesh[], loadFile: LoadFile) => {
  const bytes = meshes.some((mesh) => mesh.draws.some((draw) => draw.surface.houseColourable))
    ? await loadFile(HOUSE_COLOR_INI)
    : undefined;

  return parseHouseColours(bytes ? new TextDecoder("windows-1252").decode(bytes) : "");
};

export const loadSceneDraws = async (
  meshes: readonly W3dMesh[],
  loadFile: LoadFile,
  tools: ToolBox,
  decodePng?: DecodePng,
): Promise<SceneDraws> => {
  const houseColours = await loadHouseColours(meshes, loadFile);
  const getMaskUse = ({ texture, surface }: W3dMaterialDraw): TextureUse | undefined => {
    const mask =
      texture && surface.houseColourable
        ? houseColours.get(texture.name.toLowerCase())
        : undefined;

    return mask === undefined ? undefined : { name: mask, clampU: false, clampV: false };
  };
  const uses = new Map(
    meshes.flatMap((mesh) =>
      mesh.draws
        .flatMap((draw) => [...getUses(draw), getMaskUse(draw)])
        .flatMap((use) => (use ? [[getUseKey(use), use] as const] : [])),
    ),
  );
  const names = [...new Set([...uses.values()].map((use) => use.name))].slice(
    0,
    MAX_TEXTURE_NAMES,
  );
  const drawnNames = new Set(
    meshes.flatMap((mesh) => mesh.draws.flatMap(getUses)).map((use) => use.name),
  );
  const decoded = new Map(
    await Promise.all(
      names.map(
        async (name) =>
          [
            name,
            await (drawnNames.has(name)
              ? loadTexture(name, loadFile, tools)
              : loadMask(name, loadFile, tools, decodePng)),
          ] as const,
      ),
    ),
  );
  const textures: RgbaImage[] = [];
  const addressing: SceneTextureAddressing[] = [];
  const indexOfUse = new Map<string, number>();

  for (const [key, use] of uses) {
    const image = decoded.get(use.name);

    if (image) {
      indexOfUse.set(key, textures.length);
      textures.push(use.isBumpMap ? buildBumpOffsets(image) : image);
      addressing.push({ clampU: use.clampU, clampV: use.clampV });
    }
  }

  const findIndex = (use: TextureUse | undefined) =>
    use && indexOfUse.get(getUseKey(use));
  const flipAll = meshes.map(() => {
    const flipped = new Map<Float32Array, Float32Array>();

    return (uvs: Float32Array | undefined) => {
      if (uvs && !flipped.has(uvs)) {
        flipped.set(uvs, flipV(uvs));
      }
      return uvs && flipped.get(uvs);
    };
  });

  return {
    textures,
    addressing,
    missing: [...drawnNames].filter((name) => !decoded.get(name)),
    draws: meshes.map((mesh, at) =>
      mesh.draws.map((draw) => ({
        ...draw,
        uvs: flipAll[at](draw.uvs),
        detailUvs: flipAll[at](draw.detailUvs),
        texture: findIndex(getBaseUse(draw)),
        textured: !!draw.texture,
        detailTexture: findIndex(draw.detailTexture),
        normalMap: findIndex(getNormalMapUse(draw)),
        houseMask: findIndex(getMaskUse(draw)),
      })),
    ),
    uvs: meshes.map((mesh, at) => flipAll[at](mesh.uvs)),
  };
};
