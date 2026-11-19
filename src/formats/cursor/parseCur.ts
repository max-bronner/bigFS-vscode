import type { CursorFrame, CursorParseOptions } from './cursorFrame';
import { decodeDib, MAX_CURSOR_DIMENSION } from './decodeDib';

const DIRECTORY_LENGTH = 6;
const ENTRY_LENGTH = 16;
const TYPE_ICON = 1;
const TYPE_CURSOR = 2;
const MAX_ENTRIES = 256;
const PNG_SIGNATURE = [137, 80, 78, 71];
const PNG_SIZE_OFFSET = 16;

export const parseCur = (
  bytes: Uint8Array,
  options: CursorParseOptions = {},
): CursorFrame[] => {
  if (bytes.length < DIRECTORY_LENGTH) {
    throw new Error('Too short for a cursor header');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = view.getUint16(2, true);
  const count = view.getUint16(4, true);

  if (type !== TYPE_ICON && type !== TYPE_CURSOR) {
    throw new Error(`Not a cursor or icon: type ${type}`);
  }

  if (!count) {
    throw new Error('The cursor holds no images');
  }

  if (count > MAX_ENTRIES) {
    throw new Error(
      `The cursor claims ${count} images; at most ${MAX_ENTRIES} are read`,
    );
  }

  if (DIRECTORY_LENGTH + count * ENTRY_LENGTH > bytes.length) {
    throw new Error('The cursor directory runs past the end of the file');
  }

  let stated = 0;

  for (let index = 0; index < count; index++) {
    stated += view.getUint32(
      DIRECTORY_LENGTH + index * ENTRY_LENGTH + 8,
      true,
    );
  }

  if (stated > bytes.length) {
    throw new Error('The cursor images claim more bytes than the file holds');
  }

  return Array.from({ length: count }, (_, index) => {
    const entry = DIRECTORY_LENGTH + index * ENTRY_LENGTH;
    const length = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);

    if (offset > bytes.length || length > bytes.length - offset) {
      throw new Error(`Image ${index + 1} runs past the end of the file`);
    }

    const payload = bytes.subarray(offset, offset + length);
    const image = PNG_SIGNATURE.every((byte, at) => payload[at] === byte)
      ? decodePngPayload(payload, options)
      : decodeDib(payload);

    return {
      ...image,
      hotspotX: type === TYPE_CURSOR ? view.getUint16(entry + 4, true) : 0,
      hotspotY: type === TYPE_CURSOR ? view.getUint16(entry + 6, true) : 0,
    };
  });
};

const decodePngPayload = (payload: Uint8Array, options: CursorParseOptions) => {
  if (!options.decodePng) {
    throw new Error('A PNG-compressed image needs a PNG decoder');
  }

  if (payload.length < PNG_SIZE_OFFSET + 8) {
    throw new Error('The PNG image is cut short');
  }

  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const width = view.getUint32(PNG_SIZE_OFFSET);
  const height = view.getUint32(PNG_SIZE_OFFSET + 4);

  if (width > MAX_CURSOR_DIMENSION || height > MAX_CURSOR_DIMENSION) {
    throw new Error(
      `Image size ${width}x${height} is outside 1 to ${MAX_CURSOR_DIMENSION}`,
    );
  }

  return options.decodePng(payload);
};
