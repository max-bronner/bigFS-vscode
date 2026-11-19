import { readChunks, readName } from './w3dChunks';

export type W3dFileKind = 'model' | 'skeleton' | 'animation' | 'other';

export interface W3dHeader {
  kind: W3dFileKind;
  hierarchy?: string;
}

const CHUNK = {
  MESH: 0x000,
  HIERARCHY: 0x100,
  HIERARCHY_HEADER: 0x101,
  ANIMATION: 0x200,
  ANIMATION_HEADER: 0x201,
  COMPRESSED_ANIMATION: 0x280,
  COMPRESSED_ANIMATION_HEADER: 0x281,
  HLOD: 0x700,
  HLOD_HEADER: 0x701,
};

const readHeaderName = (
  container: Uint8Array,
  headerType: number,
  at: number,
): string | undefined => {
  const header = readChunks(container).find(
    (chunk) => chunk.type === headerType,
  );

  return header && header.payload.length >= at + 16
    ? readName(header.payload, at, 16).trim() || undefined
    : undefined;
};

export const readW3dHeader = (bytes: Uint8Array): W3dHeader => {
  const chunks = readChunks(bytes);
  const find = (...types: number[]) =>
    chunks.find((chunk) => types.includes(chunk.type));
  const hlod = find(CHUNK.HLOD);

  if (hlod) {
    return {
      kind: 'model',
      hierarchy: readHeaderName(hlod.payload, CHUNK.HLOD_HEADER, 24),
    };
  }

  const animation = find(CHUNK.ANIMATION, CHUNK.COMPRESSED_ANIMATION);

  if (animation) {
    return {
      kind: 'animation',
      hierarchy: readHeaderName(
        animation.payload,
        animation.type === CHUNK.ANIMATION
          ? CHUNK.ANIMATION_HEADER
          : CHUNK.COMPRESSED_ANIMATION_HEADER,
        20,
      ),
    };
  }

  const hierarchy = find(CHUNK.HIERARCHY);

  if (hierarchy) {
    return {
      kind: 'skeleton',
      hierarchy: readHeaderName(hierarchy.payload, CHUNK.HIERARCHY_HEADER, 4),
    };
  }

  return { kind: find(CHUNK.MESH) ? 'model' : 'other' };
};

