export class ByteReaderOverrunError extends Error {
  constructor(
    readonly offset: number,
    readonly requested: number,
    readonly length: number,
    message = `Read of ${requested} bytes at offset ${offset} overruns the ${length} bytes available`,
  ) {
    super(message);
    this.name = 'ByteReaderOverrunError';
  }
}

export interface ByteReader {
  readonly offset: number;
  readonly remaining: number;
  u8(): number;
  u16(): number;
  u32(): number;
  i32(): number;
  f32(): number;
  bytes(length: number): Uint8Array;
  cstring(): string;
  ascii(length: number): string;
  seek(offset: number): void;
  skip(length: number): void;
}

export interface ByteReaderOptions {
  start?: number;
  end?: number;
  describeOverrun?: (offset: number, requested: number, length: number) => string;
}

export const createByteReader = (
  bytes: Uint8Array,
  littleEndian = true,
  options: ByteReaderOptions = {},
): ByteReader => {
  const { start: first = 0, describeOverrun } = options;
  const end = Math.min(options.end ?? bytes.byteLength, bytes.byteLength);
  const overrun = (at: number, requested: number) =>
    new ByteReaderOverrunError(at, requested, end, describeOverrun?.(at, requested, end));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = first;

  const claim = (length: number): number => {
    if (!Number.isInteger(length) || length < 0 || length > end - offset) {
      throw overrun(offset, length);
    }
    const start = offset;
    offset += length;
    return start;
  };

  const latin1 = (start: number, length: number): string => {
    let text = '';
    for (let index = start; index < start + length; index++) {
      text += String.fromCharCode(bytes[index]);
    }
    return text;
  };

  return {
    get offset() {
      return offset;
    },
    get remaining() {
      return end - offset;
    },
    u8: () => view.getUint8(claim(1)),
    u16: () => view.getUint16(claim(2), littleEndian),
    u32: () => view.getUint32(claim(4), littleEndian),
    i32: () => view.getInt32(claim(4), littleEndian),
    f32: () => view.getFloat32(claim(4), littleEndian),
    bytes: (length) => {
      const start = claim(length);
      return bytes.slice(start, start + length);
    },
    cstring: () => {
      const terminator = bytes.subarray(0, end).indexOf(0, offset);
      if (terminator === -1) {
        throw overrun(offset, end - offset + 1);
      }
      const start = offset;
      offset = terminator + 1;
      return latin1(start, terminator - start);
    },
    ascii: (length) => latin1(claim(length), length),
    seek: (target) => {
      if (!Number.isInteger(target) || target < first || target > end) {
        throw overrun(target, 0);
      }
      offset = target;
    },
    skip: (length) => {
      claim(length);
    },
  };
};
