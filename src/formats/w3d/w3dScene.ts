import type { ToolBox } from "../../core/toolRegistry";
import { parseW3dTool } from "./w3dTools";
import type {
  W3dBox,
  W3dFile,
  W3dHierarchy,
  W3dHlod,
  W3dMesh,
} from "./w3dTools";
import { parseW3dAnimations } from "./w3dAnimation";
import type { W3dAnimation } from "./w3dAnimation";
import { skinVertices, toBoneMatrix } from "./w3dSkin";
import type { BoneSpaceMesh, Matrix } from "./w3dSkin";
import type { W3dBlend } from "./w3dMaterialTypes";
import type { PlayerColour } from "./w3dHouseColour";
import type { W3dFacing } from "./w3dFacing";
import { loadSceneDraws } from "./w3dSceneDraws";
import { swapTextures } from "./w3dTextureSwaps";
import type { HasFile, TextureLayers } from "./w3dTextureSwaps";
import type {
  DecodePng,
  LoadFile,
  SceneDraw,
  SceneTexture,
  SceneTextureAddressing,
} from "./w3dSceneDraws";

export interface SceneMesh {
  name: string;
  container: string;
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  texture?: number;
  alphaTest: boolean;
  blend: W3dBlend;
  hidden: boolean;
  castsShadow?: boolean;
  pickProxy?: boolean;
  draws?: SceneDraw[];
  local?: BoneSpaceMesh;
  bone?: number;
  facing?: {
    kind: W3dFacing;
    origin: [number, number, number];
    stored: { positions: Float32Array; normals?: Float32Array };
  };
}

export interface SceneSkeleton {
  name: string;
  names: string[];
  parents: number[];
  translations: number[];
  rotations: number[];
}

export interface SceneBox {
  name: string;
  lines: Float32Array;
}

export interface SceneLod {
  maxScreenSize?: number;
  meshes: number[];
}

export interface SceneHlod {
  name: string;
  lods: SceneLod[];
  skippedLodCount: number;
  aggregates: string[];
  proxies: string[];
}

export interface ModelScene {
  meshes: SceneMesh[];
  boxes: SceneBox[];
  hlod?: SceneHlod;
  textures: SceneTexture[];
  addressing?: SceneTextureAddressing[];
  missing: string[];
  textureNames?: string[];
  playerColours?: PlayerColour[];
  hierarchy?: string;
  skeleton?: SceneSkeleton;
  animation?: W3dAnimation;
  animationSkeleton?: SceneSkeleton;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

const multiply = (a: Matrix, b: Matrix): Matrix => {
  const out = new Float64Array(16);

  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;

      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[column * 4 + k];
      }

      out[column * 4 + row] = sum;
    }
  }

  return out;
};

const computeBoneMatrices = (hierarchy: W3dHierarchy | undefined): Matrix[] => {
  const matrices: Matrix[] = [];

  hierarchy?.pivots.forEach((pivot, index) => {
    const local = toBoneMatrix(pivot.translation, pivot.rotation);
    const parent =
      pivot.parent >= 0 && pivot.parent < index
        ? matrices[pivot.parent]
        : undefined;

    matrices.push(parent ? multiply(parent, local) : local);
  });

  return matrices;
};

const formatSubObjectName = (container: string, name: string) =>
  `${container}.${name}`.toLowerCase();

const findSubObject = (file: W3dFile, container: string, name: string) => {
  const wanted = formatSubObjectName(container, name);

  for (const lod of [...(file.hlod?.lods ?? [])].reverse()) {
    const found = lod.subObjects.find(
      (candidate) => candidate.name.toLowerCase() === wanted,
    );

    if (found) {
      return found;
    }
  }

  return undefined;
};

const scaleWeights = (percentages: Uint16Array): Float32Array =>
  Float32Array.from(percentages, (percentage) => percentage * 0.01);

const bindToBones = (
  mesh: W3dMesh,
  file: W3dFile,
  boneCount: number,
): BoneSpaceMesh | undefined => {
  const { positions, normals, secondPositions, secondNormals } = mesh;

  if (mesh.isSkin) {
    return mesh.bones && mesh.weights && boneCount
      ? {
          positions,
          normals,
          bones: mesh.bones,
          weights: scaleWeights(mesh.weights),
          secondPositions,
          secondNormals,
        }
      : undefined;
  }

  const bone = findSubObject(file, mesh.container, mesh.name)?.bone;

  if (bone === undefined || bone >= boneCount) {
    return undefined;
  }

  const vertexCount = positions.length / 3;
  const bones = new Uint16Array(vertexCount * 2);
  const weights = new Float32Array(vertexCount * 2);

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    bones[vertex * 2] = bone;
    weights[vertex * 2] = 1;
  }

  return { positions, normals, bones, weights };
};

const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map(
  (bits) => [bits & 1, (bits >> 1) & 1, (bits >> 2) & 1] as const,
);

const buildBoxEdges = (box: W3dBox, bone: Matrix | undefined): Float32Array => {
  const corner = ([x, y, z]: readonly [number, number, number]) => {
    const local = [
      box.center[0] + (x ? box.extent[0] : -box.extent[0]),
      box.center[1] + (y ? box.extent[1] : -box.extent[1]),
      box.center[2] + (z ? box.extent[2] : -box.extent[2]),
    ];

    if (!bone) {
      return local;
    }

    const m = bone;

    if (!box.oriented) {
      return [local[0] + m[12], local[1] + m[13], local[2] + m[14]];
    }

    return [
      m[0] * local[0] + m[4] * local[1] + m[8] * local[2] + m[12],
      m[1] * local[0] + m[5] * local[1] + m[9] * local[2] + m[13],
      m[2] * local[0] + m[6] * local[1] + m[10] * local[2] + m[14],
    ];
  };
  const out: number[] = [];

  for (let from = 0; from < CORNERS.length; from++) {
    for (let to = from + 1; to < CORNERS.length; to++) {
      if (isEdgeAligned(from, to)) {
        out.push(...corner(CORNERS[from]), ...corner(CORNERS[to]));
      }
    }
  }

  return Float32Array.from(out);
};

const isEdgeAligned = (a: number, b: number) => {
  const diff = a ^ b;

  return diff !== 0 && (diff & (diff - 1)) === 0;
};

const buildSceneHlod = (
  { name, lods, skippedLodCount, aggregates, proxies }: W3dHlod,
  meshes: W3dMesh[],
): SceneHlod => {
  const byName = new Map(
    meshes.map((mesh, at) => [formatSubObjectName(mesh.container, mesh.name), at]),
  );

  return {
    name,
    lods: lods.map((lod, at) => ({
      maxScreenSize: at === lods.length - 1 ? undefined : lod.maxScreenSize,
      meshes: lod.subObjects.flatMap((sub) => {
        const found = byName.get(sub.name.toLowerCase());

        return found === undefined ? [] : [found];
      }),
    })),
    skippedLodCount,
    aggregates: aggregates?.subObjects.map((sub) => sub.name) ?? [],
    proxies: proxies?.subObjects.map((sub) => sub.name) ?? [],
  };
};

export interface SubObjectRule {
  pattern: string;
  hide: boolean;
  source: string;
}

export interface VisibilityOptions {
  lod?: number;
  showHidden?: boolean;
  subObjectRules?: readonly SubObjectRule[];
  partOverrides?: ReadonlyMap<number, boolean>;
}

export const isSubObjectNamed = (
  mesh: Pick<SceneMesh, "container" | "name">,
  pattern: string,
): boolean => {
  const full = formatSubObjectName(mesh.container, mesh.name);
  const names = [full, full.slice(full.lastIndexOf(".") + 1)];
  const wanted = pattern.toLowerCase();

  return wanted.endsWith("*")
    ? names.some((name) => name.startsWith(wanted.slice(0, -1)))
    : names.includes(wanted);
};

const HIDDEN_ATTRIBUTE = "the W3D HIDDEN flag";

const PICK_PROXY = "being a picking proxy";

const isBoneBelow = (
  bone: number,
  ancestor: number,
  parents: readonly number[],
): boolean => {
  let at = bone;

  for (let step = 0; at > 0 && at < parents.length && step < parents.length; step++) {
    at = parents[at];
    if (at === ancestor) {
      return true;
    }
  }
  return false;
};

type VisibleMesh = Pick<SceneMesh, "container" | "name" | "hidden" | "pickProxy" | "bone">;

export const findHidingSources = (
  meshes: readonly VisibleMesh[],
  rules: readonly SubObjectRule[] = [],
  parents: readonly number[] = [],
): (string | undefined)[] => {
  const sources = meshes.map((mesh): string | undefined =>
    mesh.hidden ? HIDDEN_ATTRIBUTE : mesh.pickProxy ? PICK_PROXY : undefined,
  );

  for (const rule of rules) {
    const source = rule.hide ? rule.source : undefined;

    meshes.forEach((mesh, at) => {
      if (!isSubObjectNamed(mesh, rule.pattern)) {
        return;
      }
      sources[at] = source;

      const { bone = 0 } = mesh;

      if (bone > 0) {
        meshes.forEach((other, below) => {
          if (isBoneBelow(other.bone ?? 0, bone, parents)) {
            sources[below] = source;
          }
        });
      }
    });
  }
  return sources;
};

export const getMeshVisibility = (
  scene: Pick<ModelScene, "hlod"> & {
    meshes: readonly VisibleMesh[];
    skeleton?: Pick<SceneSkeleton, "parents">;
  },
  { lod, showHidden = false, subObjectRules, partOverrides }: VisibilityOptions = {},
): boolean[] => {
  const levels = scene.hlod?.lods ?? [];
  const chosen = levels[lod ?? levels.length - 1];
  const listed = new Set(levels.flatMap((level) => level.meshes));
  const inLevel = new Set(chosen?.meshes);
  const hiding = findHidingSources(
    scene.meshes,
    subObjectRules,
    scene.skeleton?.parents,
  );

  return scene.meshes.map(
    (_, at) =>
      (partOverrides?.get(at) ?? (showHidden || !hiding[at])) &&
      (!listed.has(at) || inLevel.has(at)),
  );
};

const loadHierarchy = async (
  name: string,
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<W3dHierarchy | undefined> => {
  for (const stem of [name, `${name}_skl`]) {
    const bytes = await loadFile(`${stem}.w3d`);
    const hierarchy = bytes && (await tools.use(parseW3dTool)(bytes)).hierarchy;

    if (hierarchy?.name.toLowerCase() === stem.toLowerCase()) {
      return hierarchy;
    }
  }

  return undefined;
};

const toSceneSkeleton = (hierarchy: W3dHierarchy): SceneSkeleton => ({
  name: hierarchy.name,
  names: hierarchy.pivots.map((pivot) => pivot.name),
  parents: hierarchy.pivots.map((pivot) => pivot.parent),
  translations: hierarchy.pivots.flatMap((pivot) => pivot.translation),
  rotations: hierarchy.pivots.flatMap((pivot) => pivot.rotation),
});

export const loadSkeleton = async (
  name: string,
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<SceneSkeleton | undefined> => {
  const hierarchy = await loadHierarchy(name, loadFile, tools).catch(
    () => undefined,
  );

  return hierarchy && toSceneSkeleton(hierarchy);
};

const loadOnce = (loadFile: LoadFile): LoadFile => {
  const loads = new Map<string, Promise<Uint8Array | undefined>>();

  return (fileName) => {
    const key = fileName.toLowerCase();
    let loading = loads.get(key);

    if (!loading) {
      loading = loadFile(fileName);
      loads.set(key, loading);
    }
    return loading;
  };
};

export const buildW3dScene = async (
  bytes: Uint8Array,
  loadAnyFile: LoadFile,
  tools: ToolBox,
  decodePng?: DecodePng,
  layers: TextureLayers = [],
  hasFile?: HasFile,
): Promise<ModelScene> => {
  const loadFile = layers.length && !hasFile ? loadOnce(loadAnyFile) : loadAnyFile;
  const parse = tools.use(parseW3dTool);
  const file = await parse(bytes);
  const [animation] = parseW3dAnimations(bytes);

  let hierarchy = file.hierarchy;
  const hierarchyName = file.hlod?.hierarchyName ?? animation?.hierarchyName;

  if (!hierarchy && hierarchyName) {
    hierarchy = await loadHierarchy(hierarchyName, loadFile, tools);
  }

  if (!file.meshes.length && !hierarchy) {
    throw new Error(
      animation
        ? `This is the animation ${animation.name}; its skeleton ${animation.hierarchyName} was not found`
        : "This W3D file has no meshes",
    );
  }

  const matrices = computeBoneMatrices(hierarchy);
  const worn = layers.length
    ? await swapTextures(file.meshes, layers, loadFile, isSubObjectNamed, hasFile)
    : { meshes: file.meshes, missing: [] };
  const { textures, addressing, missing, playerColours, draws, uvs } = await loadSceneDraws(
    worn.meshes,
    loadFile,
    tools,
    decodePng,
  );
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const meshes = file.meshes.map((mesh, at): SceneMesh => {
    const local = bindToBones(mesh, file, matrices.length);
    const firstBoneMatrix: Matrix | undefined = local && matrices[local.bones[0]];
    const positions = mesh.positions.slice();
    const normals = mesh.normals?.slice();

    if (local) {
      skinVertices(local, matrices, positions, normals);
    }

    for (let vertex = 0; vertex < positions.length; vertex += 3) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], positions[vertex + axis]);
        max[axis] = Math.max(max[axis], positions[vertex + axis]);
      }
    }

    return {
      name: mesh.name,
      container: mesh.container,
      positions,
      normals,
      uvs: uvs[at],
      indices: mesh.indices,
      texture: draws[at].find((draw) => draw.pass === 0 && draw.texture !== undefined)?.texture,
      alphaTest: mesh.alphaTest,
      blend: mesh.blend,
      hidden: mesh.hidden,
      castsShadow: mesh.castsShadow,
      pickProxy: mesh.pickProxy || undefined,
      draws: draws[at],
      local,
      bone: mesh.isSkin ? undefined : local?.bones[0],
      facing: mesh.facing && {
        kind: mesh.facing,
        origin: firstBoneMatrix ? [firstBoneMatrix[12], firstBoneMatrix[13], firstBoneMatrix[14]] : [0, 0, 0],
        stored: { positions: mesh.positions, normals: mesh.normals },
      },
    };
  });

  const sceneHlod = file.hlod && buildSceneHlod(file.hlod, file.meshes);
  const boxes = file.boxes.map((box) => {
    const bone = file.hlod?.lods
      .flatMap((lod) => lod.subObjects)
      .find((sub) => sub.name.toLowerCase() === box.name.toLowerCase())?.bone;

    return {
      name: box.name,
      lines: buildBoxEdges(box, bone === undefined ? undefined : matrices[bone]),
    };
  });

  if (!meshes.length) {
    for (const matrix of matrices) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], matrix[12 + axis]);
        max[axis] = Math.max(max[axis], matrix[12 + axis]);
      }
    }
  }

  return {
    meshes,
    boxes,
    hlod: sceneHlod,
    textures,
    addressing,
    missing: [...new Set([...missing, ...worn.missing])],
    textureNames: [
      ...new Set(
        file.meshes.flatMap((mesh) =>
          mesh.draws.flatMap((draw) => (draw.texture ? [draw.texture.name] : [])),
        ),
      ),
    ],
    playerColours,
    hierarchy: hierarchy?.name,
    skeleton: hierarchy && toSceneSkeleton(hierarchy),
    animation,
    animationSkeleton:
      animation &&
      hierarchy &&
      animation.hierarchyName.toLowerCase() !== hierarchy.name.toLowerCase()
        ? await loadSkeleton(animation.hierarchyName, loadFile, tools)
        : undefined,
    bounds: { min, max },
  };
};
