export interface RiffChunk {
  id: string;
  data: Uint8Array;
}

const HEADER_LENGTH = 8;

export const readRiffChunks = (
  bytes: Uint8Array,
  start: number,
  context: string,
): RiffChunk[] => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: RiffChunk[] = [];
  let at = start;

  while (at + HEADER_LENGTH <= bytes.length) {
    const size = view.getUint32(at + 4, true);
    const dataStart = at + HEADER_LENGTH;

    if (size > bytes.length - dataStart) {
      throw new Error(`${context}: a chunk at byte ${at} runs past the end`);
    }

    chunks.push({
      id: String.fromCharCode(...bytes.subarray(at, at + 4)),
      data: bytes.subarray(dataStart, dataStart + size),
    });
    at = dataStart + size + (size & 1);
  }

  return chunks;
};
