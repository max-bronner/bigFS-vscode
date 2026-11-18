import type { ToolBox } from "../../services/toolRegistry";
import { decodeDdsTool, decodeTgaTool } from "../texture/textureTools";
import type { RgbaImage } from "../texture/textureTools";
import { parseW3dTool } from "./w3dTools";
import type {
  W3dBlend,
  W3dBox,
  W3dFile,
  W3dHierarchy,
  W3dHlodArray,
  W3dMesh,
} from "./w3dTools";
import { parseW3dAnimations } from "./w3dAnimation";
import type { W3dAnimation } from "./w3dAnimation";

export interface SceneMesh {
  name: string;
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  texture?: number;
  alphaTest: boolean;
  blend: W3dBlend;
  hidden: boolean;
  local?: {
    positions: Float32Array;
    normals?: Float32Array;
    bones: Uint16Array;
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
  aggregates: string[];
  proxies: string[];
}

export interface ModelScene {
  meshes: SceneMesh[];
  boxes: SceneBox[];
  hlod?: SceneHlod;
  textures: RgbaImage[];
  missing: string[];
  hierarchy?: string;
  skeleton?: SceneSkeleton;
  animation?: W3dAnimation;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

export type LoadFile = (fileName: string) => Promise<Uint8Array | undefined>;

type Matrix = Float64Array;

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

const pivotMatrix = (
  [tx, ty, tz]: [number, number, number],
  [x, y, z, w]: [number, number, number, number],
): Matrix =>
  Float64Array.from([
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    0,
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    0,
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y),
    0,
    tx,
    ty,
    tz,
    1,
  ]);

const boneMatrices = (hierarchy: W3dHierarchy | undefined): Matrix[] => {
  const matrices: Matrix[] = [];

  hierarchy?.pivots.forEach((pivot, index) => {
    const local = pivotMatrix(pivot.translation, pivot.rotation);
    const parent =
      pivot.parent >= 0 && pivot.parent < index
        ? matrices[pivot.parent]
        : undefined;

    matrices.push(parent ? multiply(parent, local) : local);
  });

  return matrices;
};

const transform = (
  values: Float32Array,
  matrixOf: (vertex: number) => Matrix | undefined,
  isPoint: boolean,
): Float32Array => {
  const out = new Float32Array(values.length);

  for (let vertex = 0; vertex < values.length / 3; vertex++) {
    const m = matrixOf(vertex);
    const [x, y, z] = values.subarray(vertex * 3, vertex * 3 + 3);

    if (!m) {
      out.set([x, y, z], vertex * 3);
      continue;
    }

    const w = isPoint ? 1 : 0;

    out[vertex * 3] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
    out[vertex * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
    out[vertex * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
  }

  return out;
};

const flipV = (uvs: Float32Array): Float32Array =>
  uvs.map((value, index) => (index % 2 ? 1 - value : value));

const stem = (fileName: string): string => fileName.replace(/\.[^.]*$/, "");

const loadTexture = async (
  name: string,
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<RgbaImage | undefined> => {
  for (const [extension, tool] of [
    [".dds", decodeDdsTool],
    [".tga", decodeTgaTool],
  ] as const) {
    const bytes = await loadFile(`${stem(name)}${extension}`);

    if (bytes) {
      try {
        return (await tools.use(tool)(bytes)).levels[0];
      } catch {
      }
    }
  }

  return undefined;
};

const fullName = (container: string, name: string) =>
  `${container}.${name}`.toLowerCase();

const findSubObject = (file: W3dFile, container: string, name: string) => {
  const wanted = fullName(container, name);

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

const vertexBones = (
  mesh: W3dMesh,
  file: W3dFile,
): ((vertex: number) => number | undefined) => {
  if (mesh.isSkin && mesh.bones) {
    const bones = mesh.bones;

    return (vertex) => bones[vertex];
  }

  const subObject = findSubObject(file, mesh.container, mesh.name);

  return () => subObject?.bone;
};

const CORNERS = [0, 1, 2, 3, 4, 5, 6, 7].map(
  (bits) => [bits & 1, (bits >> 1) & 1, (bits >> 2) & 1] as const,
);

const boxEdges = (box: W3dBox, bone: Matrix | undefined): Float32Array => {
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
      if (edgeAligned(from, to)) {
        out.push(...corner(CORNERS[from]), ...corner(CORNERS[to]));
      }
    }
  }

  return Float32Array.from(out);
};

const edgeAligned = (a: number, b: number) => {
  const diff = a ^ b;

  return diff !== 0 && (diff & (diff - 1)) === 0;
};

const sceneHlodOf = (
  name: string,
  lods: W3dHlodArray[],
  context: {
    aggregates?: W3dHlodArray;
    proxies?: W3dHlodArray;
    meshes: W3dMesh[];
  },
): SceneHlod => {
  const byName = new Map(
    context.meshes.map((mesh, at) => [fullName(mesh.container, mesh.name), at]),
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
    aggregates: context.aggregates?.subObjects.map((sub) => sub.name) ?? [],
    proxies: context.proxies?.subObjects.map((sub) => sub.name) ?? [],
  };
};

export interface VisibilityOptions {
  lod?: number;
  showHidden?: boolean;
}

export const visibleMeshes = (
  scene: Pick<ModelScene, "meshes" | "hlod">,
  { lod, showHidden = false }: VisibilityOptions = {},
): boolean[] => {
  const levels = scene.hlod?.lods ?? [];
  const chosen = levels[lod ?? levels.length - 1];
  const listed = new Set(levels.flatMap((level) => level.meshes));
  const inLevel = new Set(chosen?.meshes);

  return scene.meshes.map(
    (mesh, at) =>
      (showHidden || !mesh.hidden) && (!listed.has(at) || inLevel.has(at)),
  );
};

export const buildW3dScene = async (
  bytes: Uint8Array,
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<ModelScene> => {
  const parse = tools.use(parseW3dTool);
  const file = await parse(bytes);
  const [animation] = parseW3dAnimations(bytes);

  let hierarchy = file.hierarchy;
  const hierarchyName = file.hlod?.hierarchyName ?? animation?.hierarchyName;

  if (!hierarchy && hierarchyName) {
    const skeleton = await loadFile(`${hierarchyName}.w3d`);

    hierarchy = skeleton ? (await parse(skeleton)).hierarchy : undefined;
  }

  if (!file.meshes.length && !hierarchy) {
    throw new Error(
      animation
        ? `This is the animation ${animation.name}; its skeleton ${animation.hierarchyName} was not found`
        : "This W3D file has no meshes",
    );
  }

  const matrices = boneMatrices(hierarchy);
  const textureNames = [
    ...new Set(
      file.meshes.flatMap((mesh) => (mesh.texture ? [mesh.texture] : [])),
    ),
  ];
  const decoded = await Promise.all(
    textureNames.map((name) => loadTexture(name, loadFile, tools)),
  );
  const textures: RgbaImage[] = [];
  const textureIndex = new Map<string, number>();

  textureNames.forEach((name, index) => {
    const image = decoded[index];

    if (image) {
      textureIndex.set(name, textures.length);
      textures.push(image);
    }
  });

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const meshes = file.meshes.map((mesh): SceneMesh => {
    const boneOf = vertexBones(mesh, file);
    const matrixOf = (vertex: number) => {
      const bone = boneOf(vertex);

      return bone === undefined ? undefined : matrices[bone];
    };
    const positions = transform(mesh.positions, matrixOf, true);

    for (let at = 0; at < positions.length; at += 3) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], positions[at + axis]);
        max[axis] = Math.max(max[axis], positions[at + axis]);
      }
    }

    const vertexCount = mesh.positions.length / 3;
    const bones = new Uint16Array(vertexCount);
    let isBound = false;

    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const bone = boneOf(vertex);

      if (bone !== undefined && bone < matrices.length) {
        bones[vertex] = bone;
        isBound = true;
      }
    }

    return {
      name: mesh.name,
      positions,
      normals: mesh.normals && transform(mesh.normals, matrixOf, false),
      uvs: mesh.uvs && flipV(mesh.uvs),
      indices: mesh.indices,
      texture: mesh.texture ? textureIndex.get(mesh.texture) : undefined,
      alphaTest: mesh.alphaTest,
      blend: mesh.blend,
      hidden: mesh.hidden,
      local: isBound
        ? { positions: mesh.positions, normals: mesh.normals, bones }
        : undefined,
    };
  });

  const sceneHlod =
    file.hlod &&
    sceneHlodOf(file.hlod.name, file.hlod.lods, {
      aggregates: file.hlod.aggregates,
      proxies: file.hlod.proxies,
      meshes: file.meshes,
    });
  const boxes = file.boxes.map((box) => {
    const bone = file.hlod?.lods
      .flatMap((lod) => lod.subObjects)
      .find((sub) => sub.name.toLowerCase() === box.name.toLowerCase())?.bone;

    return {
      name: box.name,
      lines: boxEdges(box, bone === undefined ? undefined : matrices[bone]),
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
    missing: textureNames.filter((name) => !textureIndex.has(name)),
    hierarchy: hierarchy?.name,
    skeleton: hierarchy && {
      name: hierarchy.name,
      names: hierarchy.pivots.map((pivot) => pivot.name),
      parents: hierarchy.pivots.map((pivot) => pivot.parent),
      translations: hierarchy.pivots.flatMap((pivot) => pivot.translation),
      rotations: hierarchy.pivots.flatMap((pivot) => pivot.rotation),
    },
    animation,
    bounds: { min, max },
  };
};
