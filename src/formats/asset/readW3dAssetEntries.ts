import { readName } from '../w3d/w3dChunks';
import { ASSET_KINDS } from './assetCatalogue';
import type { AssetEntry } from './assetCatalogue';

export interface W3dEntryReferences {
  subAsset: string;
  names: string[];
}

export interface W3dAssetContents {
  entries: AssetEntry[];
  references: W3dEntryReferences[];
}

const CHUNK = {
  MESH: 0x000,
  MESH_HEADER: 0x01f,
  TEXTURES: 0x030,
  TEXTURE: 0x031,
  TEXTURE_NAME: 0x032,
  SHADER_MATERIALS: 0x050,
  SHADER_MATERIAL: 0x051,
  SHADER_MATERIAL_HEADER: 0x052,
  SHADER_MATERIAL_PROPERTY: 0x053,
  HIERARCHY: 0x100,
  HIERARCHY_HEADER: 0x101,
  ANIMATION: 0x200,
  ANIMATION_HEADER: 0x201,
  COMPRESSED_ANIMATION: 0x280,
  COMPRESSED_ANIMATION_HEADER: 0x281,
  EMITTER: 0x500,
  EMITTER_HEADER: 0x501,
  EMITTER_INFO: 0x503,
  HLOD: 0x700,
  HLOD_HEADER: 0x701,
  HLOD_LOD_ARRAY: 0x702,
  HLOD_SUB_OBJECT: 0x704,
  HLOD_AGGREGATE_ARRAY: 0x705,
  BOX: 0x740,
};

const FX_TEXTURE = 1;
const NORMAL_MAP = 'normalmap';
const HEADER_LENGTH = 8;

interface Chunk {
  type: number;
  at: number;
  payload: Uint8Array;
}

const walkChunks = (bytes: Uint8Array): Chunk[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let at = 0;

  while (at + HEADER_LENGTH <= bytes.length) {
    const type = view.getUint32(at, true);
    const size = view.getUint32(at + 4, true) & 0x7fffffff;
    const end = at + HEADER_LENGTH + size;

    if (end > bytes.length) {
      break;
    }

    chunks.push({ type, at, payload: bytes.subarray(at + HEADER_LENGTH, end) });
    at = end;
  }

  return chunks;
};

const findChunk = (payload: Uint8Array, type: number): Uint8Array | undefined =>
  walkChunks(payload).find((chunk) => chunk.type === type)?.payload;

const listChunks = (payload: Uint8Array, type: number): Uint8Array[] =>
  walkChunks(payload)
    .filter((chunk) => chunk.type === type)
    .map((chunk) => chunk.payload);

const readField = (
  header: Uint8Array | undefined,
  at: number,
  length: number,
): string | undefined =>
  header && header.length >= at + length ? readName(header, at, length) : undefined;

const readMeshReferences = (mesh: Uint8Array): string[] => {
  const names: string[] = [];

  for (const table of listChunks(mesh, CHUNK.TEXTURES)) {
    for (const texture of listChunks(table, CHUNK.TEXTURE)) {
      const name = findChunk(texture, CHUNK.TEXTURE_NAME);

      if (name) {
        names.push(readName(name, 0, name.length));
      }
    }
  }

  for (const table of listChunks(mesh, CHUNK.SHADER_MATERIALS)) {
    for (const material of listChunks(table, CHUNK.SHADER_MATERIAL)) {
      for (const { type, payload } of walkChunks(material)) {
        if (type === CHUNK.SHADER_MATERIAL_HEADER) {
          names.push(readField(payload, 1, 32) ?? '');
        } else if (type === CHUNK.SHADER_MATERIAL_PROPERTY && payload.length >= 8) {
          const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
          const nameLength = view.getUint32(4, true);
          const valueAt = 8 + nameLength;

          if (
            view.getUint32(0, true) === FX_TEXTURE &&
            valueAt + 4 <= payload.length &&
            readName(payload, 8, nameLength).toLowerCase() !== NORMAL_MAP
          ) {
            names.push(readName(payload, valueAt + 4, view.getUint32(valueAt, true)));
          }
        }
      }
    }
  }

  return names;
};

const readSubObjectNames = (array: Uint8Array): string[] =>
  listChunks(array, CHUNK.HLOD_SUB_OBJECT).map((object) => readField(object, 4, 32) ?? '');

const readEntry = (
  chunk: Chunk,
): { name: string | undefined; kind: number; references: string[] } | undefined => {
  const { type, payload } = chunk;

  switch (type) {
    case CHUNK.MESH: {
      const header = findChunk(payload, CHUNK.MESH_HEADER);
      const mesh = readField(header, 8, 16);
      const container = readField(header, 24, 16);

      return {
        name: mesh === undefined ? undefined : container ? `${container}.${mesh}` : mesh,
        kind: ASSET_KINDS.MESH,
        references: readMeshReferences(payload),
      };
    }
    case CHUNK.HIERARCHY: {
      const name = readField(findChunk(payload, CHUNK.HIERARCHY_HEADER), 4, 16);

      return { name: name && `H*${name}`, kind: ASSET_KINDS.HIER, references: [] };
    }
    case CHUNK.ANIMATION:
    case CHUNK.COMPRESSED_ANIMATION: {
      const header = findChunk(
        payload,
        type === CHUNK.ANIMATION ? CHUNK.ANIMATION_HEADER : CHUNK.COMPRESSED_ANIMATION_HEADER,
      );
      const name = readField(header, 4, 16);
      const skeleton = readField(header, 20, 16);

      return {
        name: name !== undefined && skeleton !== undefined ? `A*${skeleton}.${name}` : undefined,
        kind: ASSET_KINDS.ANIM,
        references: [],
      };
    }
    case CHUNK.EMITTER: {
      const texture = readField(findChunk(payload, CHUNK.EMITTER_INFO), 0, 260);

      return {
        name: readField(findChunk(payload, CHUNK.EMITTER_HEADER), 4, 16),
        kind: ASSET_KINDS.PART,
        references: texture ? [texture] : [],
      };
    }
    case CHUNK.HLOD: {
      const header = findChunk(payload, CHUNK.HLOD_HEADER);
      const skeleton = readField(header, 24, 16);
      const [firstLod] = listChunks(payload, CHUNK.HLOD_LOD_ARRAY);

      return {
        name: readField(header, 8, 16),
        kind: ASSET_KINDS.HLOD,
        references: [
          ...(firstLod ? readSubObjectNames(firstLod) : []),
          ...listChunks(payload, CHUNK.HLOD_AGGREGATE_ARRAY).flatMap(readSubObjectNames),
          ...(skeleton ? [`h*${skeleton}`] : []),
        ],
      };
    }
    case CHUNK.BOX:
      return { name: readField(payload, 8, 32), kind: ASSET_KINDS.BOX, references: [] };
    default:
      return undefined;
  }
};

export const readW3dAssetEntries = (bytes: Uint8Array): W3dAssetContents => {
  const contents: W3dAssetContents = { entries: [], references: [] };

  for (const chunk of walkChunks(bytes)) {
    const entry = readEntry(chunk);

    if (!entry?.name) {
      continue;
    }

    contents.entries.push({
      name: entry.name,
      kind: entry.kind,
      offset: chunk.at,
      size: chunk.payload.length + HEADER_LENGTH,
    });

    const names = entry.references.filter(Boolean).map((name) => name.toLowerCase());

    if (names.length) {
      contents.references.push({ subAsset: entry.name, names });
    }
  }

  return contents;
};
