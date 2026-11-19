export interface Chunk {
  type: number;
  payload: Uint8Array;
}

export const createView = (bytes: Uint8Array): DataView =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export const readChunks = (bytes: Uint8Array): Chunk[] => {
  const view = createView(bytes);
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

export const MAX_NAME_LENGTH = 260;

export const readName = (bytes: Uint8Array, at: number, length: number): string => {
  const slice = bytes.subarray(at, Math.min(at + Math.min(length, MAX_NAME_LENGTH), bytes.length));
  const end = slice.indexOf(0);

  return String.fromCharCode(...(end < 0 ? slice : slice.subarray(0, end)));
};

export const readFloats = (bytes: Uint8Array): Float32Array => {
  const view = createView(bytes);
  const floats = new Float32Array(Math.floor(bytes.length / 4));

  floats.forEach((_, index) => {
    floats[index] = view.getFloat32(index * 4, true);
  });

  return floats;
};

export const readIds = (bytes: Uint8Array): number[] => {
  const view = createView(bytes);

  return Array.from({ length: Math.floor(bytes.length / 4) }, (_, index) =>
    view.getUint32(index * 4, true),
  );
};
