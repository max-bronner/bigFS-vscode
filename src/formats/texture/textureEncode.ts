import { checkDimensions } from './textureTools';
import type { RgbaImage } from './textureTools';

const crcTable = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let c = n;

    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export type Deflate = (data: Uint8Array) => Uint8Array;

export type Inflate = (
  data: Uint8Array,
  maxOutputLength: number,
) => Uint8Array;

export const encodePng = (image: RgbaImage, deflate: Deflate): Uint8Array => {
  const { width, height, pixels } = image;
  const raw = new Uint8Array((width * 4 + 1) * height);

  for (let row = 0; row < height; row++) {
    raw[row * (width * 4 + 1)] = 0;
    raw.set(
      pixels.subarray(row * width * 4, (row + 1) * width * 4),
      row * (width * 4 + 1) + 1,
    );
  }

  const chunks: Uint8Array[] = [Uint8Array.from(PNG_SIGNATURE)];
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);

    view.setUint32(0, data.length);
    out.set(
      Array.from(type, (char) => char.charCodeAt(0)),
      4,
    );
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    chunks.push(out);
  };
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);

  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  chunk('IHDR', header);
  chunk('IDAT', deflate(raw));
  chunk('IEND', new Uint8Array(0));

  return concat(chunks);
};

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;

  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
};

export const decodePng = (
  bytes: Uint8Array,
  inflate: Inflate,
): RgbaImage => {
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error('Not a PNG file');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colourType = 0;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const data: Uint8Array[] = [];

  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);

    if (body.length !== length) {
      throw new Error('The PNG ends early');
    }

    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = body[8];
      colourType = body[9];

      if (body[12] !== 0) {
        throw new Error(
          'Interlaced PNGs are not supported; save it without interlacing',
        );
      }
    } else if (type === 'PLTE') {
      palette = body;
    } else if (type === 'tRNS') {
      transparency = body;
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }

    at += 12 + length;
  }

  if (depth !== 8 || ![0, 2, 3, 4, 6].includes(colourType)) {
    throw new Error(
      `PNGs of ${depth}-bit colour type ${colourType} are not supported; save as 8-bit RGBA`,
    );
  }

  checkDimensions(width, height);

  if (width * height > 64 * 1024 * 1024) {
    throw new Error('The image is too large');
  }

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colourType] as number;
  const stride = width * channels;
  const raw = inflate(concat(data), height * (stride + 1));

  if (raw.length < height * (stride + 1)) {
    throw new Error('The PNG image data ends early');
  }

  const pixels = new Uint8Array(width * height * 4);
  let previous = new Uint8Array(stride);

  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    const line = Uint8Array.from(
      raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)),
    );

    if (line.length !== stride) {
      throw new Error('The PNG image data ends early');
    }

    for (let index = 0; index < stride; index++) {
      const left = index >= channels ? line[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;

      switch (filter) {
        case 1:
          line[index] += left;
          break;
        case 2:
          line[index] += up;
          break;
        case 3:
          line[index] += (left + up) >> 1;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);

          line[index] += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          break;
        }
      }
    }

    if (colourType === 6) {
      pixels.set(line, row * width * 4);
    } else {
      for (let column = 0; column < width; column++) {
        const out = (row * width + column) * 4;
        const at = column * channels;

        if (colourType === 3) {
          const index = line[at] * 3;

          pixels[out] = palette?.[index] ?? 0;
          pixels[out + 1] = palette?.[index + 1] ?? 0;
          pixels[out + 2] = palette?.[index + 2] ?? 0;
          pixels[out + 3] = transparency?.[line[at]] ?? 255;
        } else if (colourType === 2) {
          pixels[out] = line[at];
          pixels[out + 1] = line[at + 1];
          pixels[out + 2] = line[at + 2];
          pixels[out + 3] = 255;
        } else {
          pixels[out] = line[at];
          pixels[out + 1] = line[at];
          pixels[out + 2] = line[at];
          pixels[out + 3] = colourType === 4 ? line[at + 1] : 255;
        }
      }
    }

    previous = line;
  }

  return { width, height, pixels };
};

export const encodeTga = (image: RgbaImage, withAlpha: boolean): Uint8Array => {
  const { width, height, pixels } = image;
  const bytesPerPixel = withAlpha ? 4 : 3;
  const out = new Uint8Array(18 + width * height * bytesPerPixel);
  const view = new DataView(out.buffer);

  out[2] = 2;
  view.setUint16(12, width, true);
  view.setUint16(14, height, true);
  out[16] = withAlpha ? 32 : 24;
  out[17] = (withAlpha ? 8 : 0) | 0x20;

  for (let index = 0; index < width * height; index++) {
    const at = 18 + index * bytesPerPixel;

    out[at] = pixels[index * 4 + 2];
    out[at + 1] = pixels[index * 4 + 1];
    out[at + 2] = pixels[index * 4];

    if (withAlpha) {
      out[at + 3] = pixels[index * 4 + 3];
    }
  }

  return out;
};

const halve = (image: RgbaImage): RgbaImage => {
  const width = Math.max(1, image.width >> 1);
  const height = Math.max(1, image.height >> 1);
  const pixels = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 4; channel++) {
        let sum = 0;

        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          const sx = Math.min(image.width - 1, x * 2 + dx);
          const sy = Math.min(image.height - 1, y * 2 + dy);

          sum += image.pixels[(sy * image.width + sx) * 4 + channel];
        }

        pixels[(y * width + x) * 4 + channel] = (sum + 2) >> 2;
      }
    }
  }

  return { width, height, pixels };
};

const to565 = (r: number, g: number, b: number) =>
  (Math.round((r * 31) / 255) << 11) |
  (Math.round((g * 63) / 255) << 5) |
  Math.round((b * 31) / 255);

class Sink {
  public at = 0;

  public constructor(public readonly bytes: Uint8Array) {}

  public push(value: number) {
    this.bytes[this.at++] = value;
  }
}
const from565 = (c: number) => [
  (((c >> 11) & 31) * 255) / 31,
  (((c >> 5) & 63) * 255) / 63,
  ((c & 31) * 255) / 31,
];

const encodeColourBlock = (block: Uint8Array, out: Sink, isDxt1: boolean) => {
  const min = [255, 255, 255];
  const max = [0, 0, 0];
  let hasTransparent = false;

  for (let index = 0; index < 16; index++) {
    if (isDxt1 && block[index * 4 + 3] < 128) {
      hasTransparent = true;
      continue;
    }

    for (let channel = 0; channel < 3; channel++) {
      min[channel] = Math.min(min[channel], block[index * 4 + channel]);
      max[channel] = Math.max(max[channel], block[index * 4 + channel]);
    }
  }

  if (min[0] > max[0]) {
    min.fill(0);
    max.fill(0);
  }

  const widest = [0, 1, 2].reduce((best, channel) =>
    max[channel] - min[channel] > max[best] - min[best] ? channel : best,
  );
  const mean = [0, 1, 2].map((channel) => (min[channel] + max[channel]) / 2);

  for (const channel of [0, 1, 2]) {
    let covariance = 0;

    for (let index = 0; index < 16; index++) {
      if (!isDxt1 || block[index * 4 + 3] >= 128) {
        covariance +=
          (block[index * 4 + widest] - mean[widest]) *
          (block[index * 4 + channel] - mean[channel]);
      }
    }

    if (covariance < 0) {
      [min[channel], max[channel]] = [max[channel], min[channel]];
    }
  }

  let c0 = to565(max[0], max[1], max[2]);
  let c1 = to565(min[0], min[1], min[2]);

  if (hasTransparent ? c0 > c1 : c0 < c1) {
    [c0, c1] = [c1, c0];
  }

  const e0 = from565(c0);
  const e1 = from565(c1);
  const palette =
    !hasTransparent && c0 > c1
      ? [
          e0,
          e1,
          e0.map((v, i) => (2 * v + e1[i]) / 3),
          e0.map((v, i) => (v + 2 * e1[i]) / 3),
        ]
      : [e0, e1, e0.map((v, i) => (v + e1[i]) / 2)];
  let indices = 0;

  for (let index = 0; index < 16; index++) {
    let best = 0;

    if (hasTransparent && block[index * 4 + 3] < 128) {
      best = 3;
    } else {
      let bestDistance = Infinity;

      palette.forEach((colour, slot) => {
        const distance =
          (colour[0] - block[index * 4]) ** 2 +
          (colour[1] - block[index * 4 + 1]) ** 2 +
          (colour[2] - block[index * 4 + 2]) ** 2;

        if (distance < bestDistance) {
          bestDistance = distance;
          best = slot;
        }
      });
    }

    indices |= best << (index * 2);
  }

  out.push(c0 & 255);
  out.push(c0 >> 8);
  out.push(c1 & 255);
  out.push(c1 >> 8);
  out.push(indices & 255);
  out.push((indices >>> 8) & 255);
  out.push((indices >>> 16) & 255);
  out.push(indices >>> 24);
};

const encodeAlphaBlock = (block: Uint8Array, out: Sink) => {
  let low = 255;
  let high = 0;

  for (let index = 0; index < 16; index++) {
    low = Math.min(low, block[index * 4 + 3]);
    high = Math.max(high, block[index * 4 + 3]);
  }

  const palette = [
    high,
    low,
    ...[1, 2, 3, 4, 5, 6].map((step) => ((7 - step) * high + step * low) / 7),
  ];
  let lowBits = 0;
  let highBits = 0;

  for (let index = 0; index < 16; index++) {
    const alpha = block[index * 4 + 3];
    let best = 0;

    palette.forEach((value, slot) => {
      if (Math.abs(value - alpha) < Math.abs(palette[best] - alpha)) {
        best = slot;
      }
    });

    const chosen = high === low ? 0 : best;

    if (index < 8) {
      lowBits |= chosen << (index * 3);
    } else {
      highBits |= chosen << ((index - 8) * 3);
    }
  }

  out.push(high);
  out.push(low);

  for (const half of [lowBits, highBits]) {
    out.push(half & 255);
    out.push((half >> 8) & 255);
    out.push((half >> 16) & 255);
  }
};

export type DdsFormat = 'DXT1' | 'DXT3' | 'DXT5' | 'RGBA';

const getLevelSize = (image: RgbaImage, format: DdsFormat) =>
  format === 'RGBA'
    ? image.width * image.height * 4
    : Math.max(1, Math.ceil(image.width / 4)) *
      Math.max(1, Math.ceil(image.height / 4)) *
      (format === 'DXT1' ? 8 : 16);

const encodeLevel = (image: RgbaImage, format: DdsFormat, out: Sink) => {
  if (format === 'RGBA') {
    for (let index = 0; index < image.width * image.height; index++) {
      const at = index * 4;

      out.push(image.pixels[at + 2]);
      out.push(image.pixels[at + 1]);
      out.push(image.pixels[at]);
      out.push(image.pixels[at + 3]);
    }

    return;
  }

  const block = new Uint8Array(64);

  for (let by = 0; by < Math.max(1, Math.ceil(image.height / 4)); by++) {
    for (let bx = 0; bx < Math.max(1, Math.ceil(image.width / 4)); bx++) {
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const sx = Math.min(image.width - 1, bx * 4 + x);
          const sy = Math.min(image.height - 1, by * 4 + y);

          const from = (sy * image.width + sx) * 4;
          const to = (y * 4 + x) * 4;

          block[to] = image.pixels[from];
          block[to + 1] = image.pixels[from + 1];
          block[to + 2] = image.pixels[from + 2];
          block[to + 3] = image.pixels[from + 3];
        }
      }

      if (format === 'DXT3') {
        for (let pair = 0; pair < 8; pair++) {
          out.push((block[pair * 8 + 3] >> 4) | (block[pair * 8 + 7] & 0xf0));
        }
      } else if (format === 'DXT5') {
        encodeAlphaBlock(block, out);
      }

      encodeColourBlock(block, out, format === 'DXT1');
    }
  }
};

export const encodeDds = (
  image: RgbaImage,
  format: DdsFormat,
  mipmaps: boolean,
): Uint8Array => {
  const levels = [image];

  while (
    mipmaps &&
    (levels[levels.length - 1].width > 1 ||
      levels[levels.length - 1].height > 1)
  ) {
    levels.push(halve(levels[levels.length - 1]));
  }

  const out = new Uint8Array(
    128 + levels.reduce((sum, level) => sum + getLevelSize(level, format), 0),
  );
  const header = out.subarray(0, 128);
  const view = new DataView(out.buffer);
  const isCompressed = format !== 'RGBA';

  header.set([68, 68, 83, 32]);
  view.setUint32(4, 124, true);
  view.setUint32(
    8,
    0x1 |
      0x2 |
      0x4 |
      0x1000 |
      (isCompressed ? 0x80000 : 0x8) |
      (levels.length > 1 ? 0x20000 : 0),
    true,
  );
  view.setUint32(12, image.height, true);
  view.setUint32(16, image.width, true);
  view.setUint32(
    20,
    isCompressed
      ? Math.max(1, Math.ceil(image.width / 4)) *
          Math.max(1, Math.ceil(image.height / 4)) *
          (format === 'DXT1' ? 8 : 16)
      : image.width * 4,
    true,
  );
  view.setUint32(28, levels.length, true);
  view.setUint32(76, 32, true);

  if (isCompressed) {
    view.setUint32(80, 0x4, true);
    header.set(
      Array.from(format, (char) => char.charCodeAt(0)),
      84,
    );
  } else {
    view.setUint32(80, 0x41, true);
    view.setUint32(88, 32, true);
    view.setUint32(92, 0x00ff0000, true);
    view.setUint32(96, 0x0000ff00, true);
    view.setUint32(100, 0x000000ff, true);
    view.setUint32(104, 0xff000000, true);
  }

  view.setUint32(108, 0x1000 | (levels.length > 1 ? 0x400008 : 0), true);

  const sink = new Sink(out);

  sink.at = 128;
  for (const level of levels) {
    encodeLevel(level, format, sink);
  }

  return out;
};
