import type { W3dFacing } from "./w3dFacing";
import type { Tool } from "../../core/toolRegistry";
import { createView, readChunks, readFloats, readName } from "./w3dChunks";
import { readMeshMaterials } from "./w3dMaterialChunks";
import { pickMeshBlend } from "./pickMeshBlend";
import { resolveMaterialDraws } from "./resolveMaterialDraws";
import type { W3dBlend, W3dMaterialDraw } from "./w3dMaterialTypes";

export interface W3dMesh {
  name: string;
  container: string;
  isSkin: boolean;
  facing?: W3dFacing;
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  bones?: Uint16Array;
  weights?: Uint16Array;
  secondPositions?: Float32Array;
  secondNormals?: Float32Array;
  castsShadow?: boolean;
  hidden: boolean;
  texture?: string;
  alphaTest: boolean;
  blend: W3dBlend;
  pickProxy: boolean;
  draws: W3dMaterialDraw[];
}

export interface W3dPivot {
  name: string;
  parent: number;
  translation: [number, number, number];
  rotation: [number, number, number, number];
}

export interface W3dHierarchy {
  name: string;
  pivots: W3dPivot[];
}

export interface W3dSubObject {
  name: string;
  bone: number;
}

export interface W3dHlodArray {
  maxScreenSize: number;
  subObjects: W3dSubObject[];
}

export interface W3dHlod {
  name: string;
  hierarchyName: string;
  subObjects: W3dSubObject[];
  lods: W3dHlodArray[];
  skippedLodCount: number;
  aggregates?: W3dHlodArray;
  proxies?: W3dHlodArray;
}

export interface W3dBox {
  name: string;
  oriented: boolean;
  center: [number, number, number];
  extent: [number, number, number];
}

export interface W3dFile {
  meshes: W3dMesh[];
  boxes: W3dBox[];
  hierarchy?: W3dHierarchy;
  hlod?: W3dHlod;
}

const CHUNK = {
  MESH: 0x000,
  VERTICES: 0x002,
  VERTEX_NORMALS: 0x003,
  VERTEX_INFLUENCES: 0x00e,
  VERTICES_2: 0xc00,
  VERTEX_NORMALS_2: 0xc01,
  MESH_HEADER3: 0x01f,
  TRIANGLES: 0x020,
  HIERARCHY: 0x100,
  HIERARCHY_HEADER: 0x101,
  PIVOTS: 0x102,
  HLOD: 0x700,
  HLOD_HEADER: 0x701,
  HLOD_LOD_ARRAY: 0x702,
  HLOD_SUB_OBJECT_ARRAY_HEADER: 0x703,
  HLOD_SUB_OBJECT: 0x704,
  HLOD_AGGREGATE_ARRAY: 0x705,
  HLOD_PROXY_ARRAY: 0x706,
  BOX: 0x740,
};

const GEOMETRY_TYPE_MASK = 0x00ff0000;
const GEOMETRY_TYPE_SKIN = 0x00020000;
const GEOMETRY_TYPE_CAMERA_ALIGNED = 0x00010000;
const GEOMETRY_TYPE_CAMERA_ORIENTED = 0x00060000;
const MESH_FLAG_HIDDEN = 0x00001000;
const MESH_FLAG_TWO_SIDED = 0x00002000;
const MESH_FLAG_CAST_SHADOW = 0x00008000;
const MESH_HEADER_SORT_LEVEL = 56;
const BOX_ATTRIBUTE_ORIENTED = 0x1;
const BOX_SIZE = 68;
const HLOD_ARRAY_HEADER_SIZE = 8;
const HLOD_SUB_OBJECT_SIZE = 36;

const padTo = (values: Float32Array | undefined, length: number) => {
  const out = new Float32Array(length);

  out.set(values?.subarray(0, length) ?? []);

  return out;
};

const isPickProxy = (name: string) => name.slice(0, 4).toUpperCase() === "PICK";

const readFacing = (attributes: number): W3dFacing | undefined => {
  switch (attributes & GEOMETRY_TYPE_MASK) {
    case GEOMETRY_TYPE_CAMERA_ORIENTED:
      return "oriented";
    case GEOMETRY_TYPE_CAMERA_ALIGNED:
      return "aligned";
    default:
      return undefined;
  }
};

const readMesh = (payload: Uint8Array): W3dMesh | undefined => {
  let header: Uint8Array | undefined;
  let positions: Float32Array | undefined;
  let normals: Float32Array | undefined;
  let indices: Uint32Array | undefined;
  let bones: Uint16Array | undefined;
  let weights: Uint16Array | undefined;
  let secondPositions: Float32Array | undefined;
  let secondNormals: Float32Array | undefined;
  const chunks = readChunks(payload);

  for (const chunk of chunks) {
    const view = createView(chunk.payload);

    switch (chunk.type) {
      case CHUNK.MESH_HEADER3:
        header = chunk.payload;
        break;
      case CHUNK.VERTICES:
        positions = readFloats(chunk.payload);
        break;
      case CHUNK.VERTEX_NORMALS:
        normals = readFloats(chunk.payload);
        break;
      case CHUNK.TRIANGLES: {
        const count = Math.floor(chunk.payload.length / 32);

        indices = new Uint32Array(count * 3);

        for (let triangle = 0; triangle < count; triangle++) {
          for (let corner = 0; corner < 3; corner++) {
            indices[triangle * 3 + corner] = view.getUint32(
              triangle * 32 + corner * 4,
              true,
            );
          }
        }

        break;
      }
      case CHUNK.VERTEX_INFLUENCES: {
        const count = Math.floor(chunk.payload.length / 8);

        bones = new Uint16Array(count * 2);
        weights = new Uint16Array(count * 2);

        for (let index = 0; index < count * 2; index++) {
          bones[index] = view.getUint16(index * 2 + (index >> 1) * 4, true);
          weights[index] = view.getUint16(index * 2 + 4 + (index >> 1) * 4, true);
        }
        break;
      }
      case CHUNK.VERTICES_2:
        secondPositions = readFloats(chunk.payload);
        break;
      case CHUNK.VERTEX_NORMALS_2:
        secondNormals = readFloats(chunk.payload);
        break;
    }
  }

  if (!header || header.length < 116 || !positions || !indices) {
    return undefined;
  }

  const vertexCount = positions.length / 3;
  const hasInfluences = bones?.length === vertexCount * 2;
  const hasSecondCopy =
    hasInfluences && vertexCount > 0 && secondPositions?.length === positions.length;
  if (indices.some((index) => index >= vertexCount)) {
    throw new Error(
      `W3D mesh ${readName(header, 8, 16)} indexes past its vertices`,
    );
  }

  const attributes = createView(header).getUint32(4, true);
  const name = readName(header, 8, 16);
  const draws = resolveMaterialDraws(readMeshMaterials(chunks), {
    indices,
    vertexCount,
    twoSided: (attributes & MESH_FLAG_TWO_SIDED) !== 0,
    sortLevel: createView(header).getInt32(MESH_HEADER_SORT_LEVEL, true),
  });
  const firstPass = draws.filter((draw) => draw.pass === 0);

  return {
    name,
    container: readName(header, 24, 16),
    isSkin: (attributes & GEOMETRY_TYPE_MASK) === GEOMETRY_TYPE_SKIN,
    facing: readFacing(attributes),
    hidden: (attributes & MESH_FLAG_HIDDEN) !== 0,
    castsShadow: (attributes & MESH_FLAG_CAST_SHADOW) !== 0 || undefined,
    positions,
    normals: normals?.length === positions.length ? normals : undefined,
    uvs: firstPass[0]?.uvs,
    indices,
    bones: hasInfluences ? bones : undefined,
    weights: hasInfluences ? weights : undefined,
    secondPositions: hasSecondCopy ? secondPositions : undefined,
    secondNormals: hasSecondCopy
      ? padTo(secondNormals, positions.length)
      : undefined,
    texture: firstPass.find((draw) => draw.texture)?.texture?.name,
    alphaTest: firstPass.some((draw) => draw.surface.alphaTest),
    blend: pickMeshBlend(firstPass.map((draw) => draw.surface)),
    pickProxy: isPickProxy(name),
    draws,
  };
};

const readHierarchy = (payload: Uint8Array): W3dHierarchy | undefined => {
  let name = "";
  const pivots: W3dPivot[] = [];

  for (const chunk of readChunks(payload)) {
    if (chunk.type === CHUNK.HIERARCHY_HEADER && chunk.payload.length >= 36) {
      name = readName(chunk.payload, 4, 16);
    }

    if (chunk.type === CHUNK.PIVOTS) {
      const view = createView(chunk.payload);

      for (let at = 0; at + 60 <= chunk.payload.length; at += 60) {
        const parent = view.getUint32(at + 16, true);
        const float = (offset: number) => view.getFloat32(at + offset, true);

        pivots.push({
          name: readName(chunk.payload, at, 16),
          parent: parent === 0xffffffff ? -1 : parent,
          translation: [float(20), float(24), float(28)],
          rotation: [float(44), float(48), float(52), float(56)],
        });
      }
    }
  }

  return pivots.length ? { name, pivots } : undefined;
};

const readHlodArray = (payload: Uint8Array): W3dHlodArray => {
  let maxScreenSize = 0;
  const subObjects: W3dSubObject[] = [];

  for (const chunk of readChunks(payload)) {
    if (chunk.type === CHUNK.HLOD_SUB_OBJECT_ARRAY_HEADER) {
      if (chunk.payload.length < HLOD_ARRAY_HEADER_SIZE) {
        throw new Error(
          `W3D HLOD array header is ${chunk.payload.length} bytes, expected ${HLOD_ARRAY_HEADER_SIZE}`,
        );
      }
      maxScreenSize = createView(chunk.payload).getFloat32(4, true);
    } else if (chunk.type === CHUNK.HLOD_SUB_OBJECT) {
      if (chunk.payload.length < HLOD_SUB_OBJECT_SIZE) {
        throw new Error(
          `W3D HLOD sub-object is ${chunk.payload.length} bytes, expected ${HLOD_SUB_OBJECT_SIZE}`,
        );
      }
      subObjects.push({
        bone: createView(chunk.payload).getUint32(0, true),
        name: readName(chunk.payload, 4, 32),
      });
    }
  }

  return { maxScreenSize, subObjects };
};

const readHlod = (payload: Uint8Array): W3dHlod | undefined => {
  let header: Uint8Array | undefined;
  const arrays: W3dHlodArray[] = [];
  let aggregates: W3dHlodArray | undefined;
  let proxies: W3dHlodArray | undefined;

  for (const chunk of readChunks(payload)) {
    if (chunk.type === CHUNK.HLOD_HEADER) {
      header = chunk.payload;
    } else if (chunk.type === CHUNK.HLOD_LOD_ARRAY) {
      arrays.push(readHlodArray(chunk.payload));
    } else if (chunk.type === CHUNK.HLOD_AGGREGATE_ARRAY) {
      aggregates = readHlodArray(chunk.payload);
    } else if (chunk.type === CHUNK.HLOD_PROXY_ARRAY) {
      proxies = readHlodArray(chunk.payload);
    }
  }

  if (!header || header.length < 40) {
    return undefined;
  }

  const lodCount = createView(header).getUint32(4, true);
  const lods = arrays.slice(0, lodCount);

  return {
    name: readName(header, 8, 16),
    hierarchyName: readName(header, 24, 16),
    subObjects: lods.at(-1)?.subObjects ?? [],
    lods,
    skippedLodCount: arrays.length - lods.length,
    aggregates,
    proxies,
  };
};

const readBox = (payload: Uint8Array): W3dBox => {
  if (payload.length < BOX_SIZE) {
    throw new Error(
      `W3D BOX chunk is ${payload.length} bytes, expected ${BOX_SIZE}`,
    );
  }

  const view = createView(payload);
  const float = (offset: number) => view.getFloat32(offset, true);

  return {
    name: readName(payload, 8, 32),
    oriented: (view.getUint32(4, true) & BOX_ATTRIBUTE_ORIENTED) !== 0,
    center: [float(44), float(48), float(52)],
    extent: [float(56), float(60), float(64)],
  };
};

export const parseW3d = (bytes: Uint8Array): W3dFile => {
  const file: W3dFile = { meshes: [], boxes: [] };

  for (const chunk of readChunks(bytes)) {
    switch (chunk.type) {
      case CHUNK.MESH: {
        const mesh = readMesh(chunk.payload);

        if (mesh) {
          file.meshes.push(mesh);
        }

        break;
      }
      case CHUNK.BOX:
        file.boxes.push(readBox(chunk.payload));
        break;
      case CHUNK.HIERARCHY:
        file.hierarchy ??= readHierarchy(chunk.payload);
        break;
      case CHUNK.HLOD:
        file.hlod ??= readHlod(chunk.payload);
        break;
    }
  }

  return file;
};

export const parseW3dTool: Tool<Uint8Array, W3dFile> = {
  id: "model.parseW3d",
  run: parseW3d,
};
