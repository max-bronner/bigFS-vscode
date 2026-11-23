import type { W3dMesh } from "./w3dTools";
import type { LoadFile } from "./w3dSceneDraws";

export interface TextureSwap {
  from?: string;
  to: string;
  exclude?: string[];
}

export type TextureLayers = TextureSwap[][];

export type HasFile = (fileName: string) => Promise<boolean>;

export const MAX_TEXTURE_SWAPS = 256;

export const getTextureStem = (name: string): string =>
  name
    .slice(name.search(/[^\\/]*$/))
    .replace(/\.[^.]*$/, "")
    .toLowerCase();

export const swapTextures = async (
  meshes: readonly W3dMesh[],
  layers: TextureLayers,
  loadFile: LoadFile,
  isExcluded: (mesh: W3dMesh, pattern: string) => boolean,
  hasFile: HasFile = async (fileName) => !!(await loadFile(fileName)),
): Promise<{ meshes: W3dMesh[]; missing: string[] }> => {
  let budget = MAX_TEXTURE_SWAPS;
  const bounded = layers.slice(0, MAX_TEXTURE_SWAPS).map((layer) => {
    const taken = layer.slice(0, budget);

    budget -= taken.length;
    return taken;
  });
  const found = new Map<string, boolean>();
  const missing = new Set<string>();

  const isFound = async (name: string) => {
    const stem = getTextureStem(name);

    if (!found.has(stem)) {
      found.set(
        stem,
        (await hasFile(`${stem}.dds`)) ||
          (await hasFile(`${stem}.tga`)) ||
          (await hasFile(`${stem}.png`)),
      );
    }
    if (!found.get(stem)) {
      missing.add(name);
    }
    return found.get(stem);
  };

  const getName = async (mesh: W3dMesh, own: string) => {
    let name = own;

    for (const layer of bounded) {
      const stem = getTextureStem(name);

      for (const { from, to, exclude } of layer) {
        if (from !== undefined && getTextureStem(from) !== stem) {
          continue;
        }
        if (exclude?.some((pattern) => isExcluded(mesh, pattern))) {
          continue;
        }
        if (await isFound(to)) {
          name = to;
          break;
        }
      }
    }
    return name;
  };
  const swapped: W3dMesh[] = [];

  for (const mesh of meshes) {
    const draws: W3dMesh["draws"] = [];

    for (const draw of mesh.draws) {
      draws.push(
        draw.texture
          ? { ...draw, texture: { ...draw.texture, name: await getName(mesh, draw.texture.name) } }
          : draw,
      );
    }
    swapped.push({ ...mesh, draws });
  }

  return { meshes: swapped, missing: [...missing] };
};
