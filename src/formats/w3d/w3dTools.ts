import type { Tool } from "../../services/toolRegistry";

export interface W3dMesh {
  name: string;
  container: string;
  isSkin: boolean;
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  bones?: Uint16Array;
  hidden: boolean;
  texture?: string;
  alphaTest: boolean;
  blend: W3dBlend;
}

export type W3dBlend = "opaque" | "alpha" | "additive" | "multiply";

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
  MESH_HEADER3: 0x01f,
  TRIANGLES: 0x020,
  TEXTURES: 0x030,
  TEXTURE: 0x031,
  TEXTURE_NAME: 0x032,
  SHADERS: 0x029,
  MATERIAL_PASS: 0x038,
  SHADER_IDS: 0x03a,
  TEXTURE_IDS: 0x049,
  TEXTURE_STAGE: 0x048,
  STAGE_TEXCOORDS: 0x04a,
  SHADER_MATERIALS: 0x050,
  SHADER_MATERIAL: 0x051,
  SHADER_MATERIAL_PROPERTY: 0x053,
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
const MESH_FLAG_HIDDEN = 0x00001000;
const BOX_ATTRIBUTE_ORIENTED = 0x1;
const BOX_SIZE = 68;
const HLOD_ARRAY_HEADER_SIZE = 8;
const HLOD_SUB_OBJECT_SIZE = 36;

interface Chunk {
  type: number;
  payload: Uint8Array;
}

const readChunks = (bytes: Uint8Array): Chunk[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let cursor = 0;

  while (cursor + 8 <= bytes.length) {
    const type = view.getUint32(cursor, true);
    const size = view.getUint32(cursor + 4, true) & 0x7fffffff;
    const start = cursor + 8;

    if (start + size > bytes.length) {
      throw new Error(
        `W3D chunk 0x${type.toString(16)} at ${cursor} runs past the data holding it`,
      );
    }

    chunks.push({ type, payload: bytes.subarray(start, start + size) });
    cursor = start + size;
  }

  return chunks;
};

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const readName = (bytes: Uint8Array, at: number, length: number): string => {
  const slice = bytes.subarray(at, Math.min(at + length, bytes.length));
  const end = slice.indexOf(0);

  return String.fromCharCode(...(end < 0 ? slice : slice.subarray(0, end)));
};

const readFloats = (bytes: Uint8Array): Float32Array => {
  const view = viewOf(bytes);
  const floats = new Float32Array(Math.floor(bytes.length / 4));

  floats.forEach((_, index) => {
    floats[index] = view.getFloat32(index * 4, true);
  });

  return floats;
};

const readShaderMaterial = (
  material: Uint8Array,
): { texture?: string; alphaTest: boolean } => {
  let texture: string | undefined;
  let fallback: string | undefined;
  let alphaTest = false;

  for (const property of readChunks(material)) {
    if (
      property.type !== CHUNK.SHADER_MATERIAL_PROPERTY ||
      property.payload.length < 12
    ) {
      continue;
    }

    const view = viewOf(property.payload);
    const type = view.getUint32(0, true);
    const nameLength = view.getUint32(4, true);
    const name = readName(property.payload, 8, nameLength);
    const valueAt = 8 + nameLength;

    if (type === 7 && valueAt < property.payload.length) {
      if (name === "AlphaTestEnable") {
        alphaTest = property.payload[valueAt] !== 0;
      }
      continue;
    }
    if (type !== 1 || valueAt + 4 > property.payload.length) {
      continue;
    }

    const value = readName(
      property.payload,
      valueAt + 4,
      view.getUint32(valueAt, true),
    );

    if (name === "DiffuseTexture") {
      texture = value;
    } else if (name === "Texture_0") {
      fallback = value;
    }
  }

  return { texture: texture ?? fallback, alphaTest };
};

const readIds = (bytes: Uint8Array): number[] => {
  const view = viewOf(bytes);

  return Array.from({ length: Math.floor(bytes.length / 4) }, (_, index) =>
    view.getUint32(index * 4, true),
  );
};

const blendOf = (shader: Uint8Array): W3dBlend => {
  const [, depthMask, , destBlend, , , , srcBlend, , , , , alphaTest] = shader;

  if (alphaTest && depthMask && destBlend === 5) {
    return "opaque";
  }
  if (destBlend === 1) {
    return "additive";
  }
  if (destBlend === 4 || destBlend === 5) {
    return "alpha";
  }
  if (destBlend === 2 && srcBlend === 0) {
    return "multiply";
  }
  return "opaque";
};

const BLEND_RANK: W3dBlend[] = ["opaque", "multiply", "alpha", "additive"];

const readFirstPass = (payload: Uint8Array) => {
  let uvs: Float32Array | undefined;
  let stageUvs: Float32Array | undefined;
  let textureId: number | undefined;
  let shaderIds: number[] = [];
  let stages = 0;

  for (const part of readChunks(payload)) {
    if (part.type === CHUNK.SHADER_IDS) {
      shaderIds = readIds(part.payload);
    } else if (part.type === CHUNK.STAGE_TEXCOORDS) {
      uvs = readFloats(part.payload);
    } else if (part.type === CHUNK.TEXTURE_STAGE && stages++ === 0) {
      for (const stagePart of readChunks(part.payload)) {
        if (stagePart.type === CHUNK.TEXTURE_IDS) {
          textureId = readIds(stagePart.payload)[0];
        } else if (stagePart.type === CHUNK.STAGE_TEXCOORDS) {
          stageUvs = readFloats(stagePart.payload);
        }
      }
    }
  }
  return {
    uvs: stageUvs?.length ? stageUvs : uvs,
    textureId,
    shaderIds,
  };
};

const readMesh = (payload: Uint8Array): W3dMesh | undefined => {
  let header: Uint8Array | undefined;
  let positions: Float32Array | undefined;
  let normals: Float32Array | undefined;
  let indices: Uint32Array | undefined;
  let bones: Uint16Array | undefined;
  const textures: string[] = [];
  let pass: ReturnType<typeof readFirstPass> | undefined;
  let shaders: Uint8Array[] = [];
  const materials: { texture?: string; alphaTest: boolean }[] = [];

  for (const chunk of readChunks(payload)) {
    const view = viewOf(chunk.payload);

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

        bones = new Uint16Array(count);
        bones.forEach((_, index) => {
          bones![index] = view.getUint16(index * 8, true);
        });
        break;
      }
      case CHUNK.TEXTURES:
        for (const texture of readChunks(chunk.payload)) {
          const name = readChunks(texture.payload).find(
            (part) => part.type === CHUNK.TEXTURE_NAME,
          );

          if (texture.type === CHUNK.TEXTURE && name) {
            textures.push(readName(name.payload, 0, name.payload.length));
          }
        }
        break;
      case CHUNK.MATERIAL_PASS:
        pass ??= readFirstPass(chunk.payload);
        break;
      case CHUNK.SHADERS:
        shaders = Array.from(
          { length: Math.floor(chunk.payload.length / 16) },
          (_, index) => chunk.payload.subarray(index * 16, index * 16 + 16),
        );
        break;
      case CHUNK.SHADER_MATERIALS:
        for (const material of readChunks(chunk.payload)) {
          if (material.type === CHUNK.SHADER_MATERIAL) {
            materials.push(readShaderMaterial(material.payload));
          }
        }
        break;
    }
  }

  if (!header || header.length < 116 || !positions || !indices) {
    return undefined;
  }

  const vertexCount = positions.length / 3;
  const drawn = (pass?.shaderIds ?? []).flatMap((id) =>
    shaders[id] ? [shaders[id]] : [],
  );

  if (indices.some((index) => index >= vertexCount)) {
    throw new Error(
      `W3D mesh ${readName(header, 8, 16)} indexes past its vertices`,
    );
  }

  return {
    name: readName(header, 8, 16),
    container: readName(header, 24, 16),
    isSkin:
      (viewOf(header).getUint32(4, true) & GEOMETRY_TYPE_MASK) ===
      GEOMETRY_TYPE_SKIN,
    hidden: (viewOf(header).getUint32(4, true) & MESH_FLAG_HIDDEN) !== 0,
    positions,
    normals: normals?.length === positions.length ? normals : undefined,
    uvs: pass?.uvs?.length === vertexCount * 2 ? pass.uvs : undefined,
    indices,
    bones: bones?.length === vertexCount ? bones : undefined,
    texture:
      (pass?.textureId !== undefined ? textures[pass.textureId] : undefined) ??
      materials.find((material) => material.texture)?.texture,
    alphaTest:
      drawn.some((shader) => shader[12] !== 0) ||
      materials.some((material) => material.alphaTest),
    blend: drawn
      .map(blendOf)
      .reduce<W3dBlend>(
        (best, each) =>
          BLEND_RANK.indexOf(each) > BLEND_RANK.indexOf(best) ? each : best,
        "opaque",
      ),
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
      const view = viewOf(chunk.payload);

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
      maxScreenSize = viewOf(chunk.payload).getFloat32(4, true);
    } else if (chunk.type === CHUNK.HLOD_SUB_OBJECT) {
      if (chunk.payload.length < HLOD_SUB_OBJECT_SIZE) {
        throw new Error(
          `W3D HLOD sub-object is ${chunk.payload.length} bytes, expected ${HLOD_SUB_OBJECT_SIZE}`,
        );
      }
      subObjects.push({
        bone: viewOf(chunk.payload).getUint32(0, true),
        name: readName(chunk.payload, 4, 32),
      });
    }
  }

  return { maxScreenSize, subObjects };
};

const readHlod = (payload: Uint8Array): W3dHlod | undefined => {
  let header: Uint8Array | undefined;
  const lods: W3dHlodArray[] = [];
  let aggregates: W3dHlodArray | undefined;
  let proxies: W3dHlodArray | undefined;

  for (const chunk of readChunks(payload)) {
    if (chunk.type === CHUNK.HLOD_HEADER) {
      header = chunk.payload;
    } else if (chunk.type === CHUNK.HLOD_LOD_ARRAY) {
      lods.push(readHlodArray(chunk.payload));
    } else if (chunk.type === CHUNK.HLOD_AGGREGATE_ARRAY) {
      aggregates = readHlodArray(chunk.payload);
    } else if (chunk.type === CHUNK.HLOD_PROXY_ARRAY) {
      proxies = readHlodArray(chunk.payload);
    }
  }

  if (!header || header.length < 40) {
    return undefined;
  }

  return {
    name: readName(header, 8, 16),
    hierarchyName: readName(header, 24, 16),
    subObjects: lods.at(-1)?.subObjects ?? [],
    lods,
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

  const view = viewOf(payload);
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
