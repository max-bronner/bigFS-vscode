export const buildChunk = (
  type: number,
  payload: Uint8Array,
  holdsChunks = false,
) => {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);

  view.setUint32(0, type, true);
  view.setUint32(4, payload.length | (holdsChunks ? 0x80000000 : 0), true);

  return concatBytes(header, payload);
};

export const concatBytes = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let at = 0;

  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
};

export const encodeFloats = (...values: number[]) =>
  new Uint8Array(Float32Array.from(values).buffer);
export const encodeUints = (...values: number[]) =>
  new Uint8Array(Uint32Array.from(values).buffer);

export const encodeName = (text: string, length: number) => {
  const bytes = new Uint8Array(length);

  bytes.set(Array.from(text, (c) => c.charCodeAt(0)));

  return bytes;
};

export const meshHeader = (meshName: string, container: string, attributes = 0) => {
  const header = new Uint8Array(116);
  const view = new DataView(header.buffer);

  view.setUint32(4, attributes, true);
  header.set(encodeName(meshName, 16), 8);
  header.set(encodeName(container, 16), 24);
  view.setUint32(40, 1, true);
  view.setUint32(44, 3, true);

  return header;
};

export const triangle = (a: number, b: number, c: number) =>
  concatBytes(encodeUints(a, b, c, 0), encodeFloats(0, 0, 1, 0));

export const mesh = (meshName: string) =>
  buildChunk(
    0x000,
    concatBytes(
      buildChunk(0x01f, meshHeader(meshName, 'UNIT')),
      buildChunk(0x002, encodeFloats(0, 0, 0, 1, 0, 0, 0, 1, 0)),
      buildChunk(0x003, encodeFloats(0, 0, 1, 0, 0, 1, 0, 0, 1)),
      buildChunk(0x020, triangle(0, 1, 2)),
      buildChunk(0x030, buildChunk(0x031, buildChunk(0x032, encodeName('Unit.tga', 9)), true), true),
      buildChunk(
        0x038,
        buildChunk(
          0x048,
          concatBytes(
            buildChunk(0x049, encodeUints(0)),
            buildChunk(0x04a, encodeFloats(0, 0, 1, 0, 0, 1)),
          ),
          true,
        ),
        true,
      ),
    ),
    true,
  );

export const pivot = (pivotName: string, parent: number, translation: number[]) =>
  concatBytes(
    encodeName(pivotName, 16),
    encodeUints(parent),
    encodeFloats(...translation, 0, 0, 0, 0, 0, 0, 1),
  );

export const hierarchy = buildChunk(
  0x100,
  concatBytes(
    buildChunk(
      0x101,
      concatBytes(encodeUints(0), encodeName('UNIT_SKL', 16), encodeUints(2), encodeFloats(0, 0, 0)),
    ),
    buildChunk(
      0x102,
      concatBytes(
        pivot('ROOTTRANSFORM', 0xffffffff, [0, 0, 0]),
        pivot('ARM', 0, [0, 0, 10]),
      ),
    ),
  ),
  true,
);

export const hlod = buildChunk(
  0x700,
  concatBytes(
    buildChunk(0x701, concatBytes(encodeUints(0, 1), encodeName('UNIT', 16), encodeName('UNIT_SKL', 16))),
    buildChunk(
      0x702,
      concatBytes(
        buildChunk(0x703, concatBytes(encodeUints(1), encodeFloats(0))),
        buildChunk(0x704, concatBytes(encodeUints(1), encodeName('UNIT.BODY', 32))),
      ),
      true,
    ),
  ),
  true,
);
