import { createHash } from 'crypto';
import { deflateSync, inflateSync } from 'zlib';
import { decodeDib } from '../../formats/cursor/decodeDib';
import { decodeDds, decodeTga } from '../../formats/texture/textureTools';
import type { DecodedTexture } from '../../formats/texture/textureTools';
import {
  decodePng,
  encodeDds,
  encodePng,
} from '../../formats/texture/textureEncode';
import { Plane, addBlock, idct, putBlock } from '../../formats/vp6/dsp';

const createRandom = (seed: number) => {
  let state = seed;

  return (limit: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return Math.floor((state / 4294967296) * limit);
  };
};

const digest = (parts: (Uint8Array | string)[]): string => {
  const hash = createHash('sha256');

  parts.forEach((part) =>
    hash.update(typeof part === 'string' ? part : Buffer.from(part)),
  );

  return hash.digest('hex');
};

const attempt = <T>(run: () => T): T | 'rejected' => {
  try {
    return run();
  } catch {
    return 'rejected';
  }
};

const describeTexture = (texture: DecodedTexture | 'rejected'): string =>
  texture === 'rejected'
    ? texture
    : `${texture.format}|${texture.hasAlpha}|` +
      texture.levels
        .map(
          (level) =>
            `${level.width}x${level.height}:${Buffer.from(level.pixels).toString('hex')}`,
        )
        .join('|');

const createBytes = (random: (limit: number) => number, length: number) =>
  Uint8Array.from({ length }, () => random(256));

const tgaDigest = (): string => {
  const random = createRandom(7);
  const parts: string[] = [];

  for (let round = 0; round < 300; round++) {
    const width = 1 + random(9);
    const height = 1 + random(9);
    const type = [1, 2, 3, 9, 10, 11][random(6)];
    const isMapped = type === 1 || type === 9;
    const bits = type === 3 || type === 11 ? 8 : [16, 24, 32][random(3)];
    const header = new Uint8Array(18);

    header[1] = isMapped ? 1 : 0;
    header[2] = type;

    if (isMapped) {
      header[5] = 16;
      header[7] = bits === 8 ? 24 : bits;
    }

    header[12] = width;
    header[14] = height;
    header[16] = isMapped ? 8 : bits;
    header[17] = (random(2) ? 0x20 : 0) | (random(2) ? 0x10 : 0) | random(9);

    const file = Uint8Array.from([
      ...header,
      ...(isMapped ? createBytes(random, 48) : []),
      ...createBytes(random, random(width * height * 4 + 300)),
    ]);

    parts.push(describeTexture(attempt(() => decodeTga(file))));
  }

  return digest(parts);
};

const ddsDigest = (): string => {
  const random = createRandom(11);
  const parts: (Uint8Array | string)[] = [];

  for (let round = 0; round < 300; round++) {
    const format = (['DXT1', 'DXT3', 'DXT5', 'RGBA'] as const)[random(4)];
    const width = 1 + random(11);
    const height = 1 + random(11);
    const pixels = createBytes(random, width * height * 4);

    if (random(2)) {
      for (let at = 3; at < pixels.length; at += 4) {
        pixels[at] = random(2) * 255;
      }
    }

    const dds = encodeDds({ width, height, pixels }, format, random(2) === 1);
    const noisy = Uint8Array.from(dds);

    for (let at = 128; at < noisy.length; at++) {
      noisy[at] = random(256);
    }

    parts.push(dds, describeTexture(attempt(() => decodeDds(dds))));
    parts.push(describeTexture(attempt(() => decodeDds(noisy))));
  }

  return digest(parts);
};

const uncompressedDdsDigest = (): string => {
  const random = createRandom(13);
  const parts: string[] = [];

  for (let round = 0; round < 200; round++) {
    const file = new Uint8Array(128 + 12 * 12 * 4 * 2);
    const view = new DataView(file.buffer);

    view.setUint32(0, 0x20534444, true);
    view.setUint32(12, 1 + random(8), true);
    view.setUint32(16, 1 + random(8), true);
    view.setUint32(28, 1 + random(3), true);
    view.setUint32(80, 0x40 | random(2), true);
    view.setUint32(88, [16, 24, 32][random(3)], true);

    [0xff0000, 0xff00, 0xff, 0xff000000].forEach((mask, index) =>
      view.setUint32(
        92 + index * 4,
        random(2) ? mask : (random(0x10000) << random(16)) >>> 0,
        true,
      ),
    );
    file.set(createBytes(random, file.length - 128), 128);
    parts.push(describeTexture(attempt(() => decodeDds(file))));
  }

  return digest(parts);
};

const pngDigest = (): string => {
  const random = createRandom(17);
  const parts: (Uint8Array | string)[] = [];

  for (let round = 0; round < 200; round++) {
    const width = 1 + random(9);
    const height = 1 + random(9);
    const png = encodePng(
      { width, height, pixels: createBytes(random, width * height * 4) },
      (data) => deflateSync(data),
    );
    const decoded = attempt(() =>
      decodePng(png, (data, limit) =>
        inflateSync(data, { maxOutputLength: limit }),
      ),
    );

    parts.push(
      png,
      decoded === 'rejected' ? decoded : Buffer.from(decoded.pixels),
    );
  }

  return digest(parts);
};

const transformDigest = (): string => {
  const random = createRandom(19);
  const parts: Uint8Array[] = [];

  for (let round = 0; round < 800; round++) {
    const coefficients = Int16Array.from({ length: 64 }, () =>
      random(2) ? random(65536) - 32768 : random(600) - 300,
    );
    const transformed = Int16Array.from(coefficients);

    idct(transformed);

    const plane = new Plane(
      8 * (1 + random(3)) + (random(2) ? 4 : 0),
      8 * (1 + random(3)) + (random(2) ? 3 : 0),
    );
    const block = Int16Array.from(coefficients);
    const target = [random(4), random(5), random(2) === 1] as const;

    plane.data.set(createBytes(random, plane.data.length));
    (random(3) === 0 ? putBlock : addBlock)(
      block,
      random(2) === 1,
      plane,
      ...target,
    );
    parts.push(
      new Uint8Array(transformed.buffer),
      plane.data,
      new Uint8Array(block.buffer),
    );
  }

  return digest(parts);
};

const dibDigest = (): string => {
  const random = createRandom(23);
  const parts: string[] = [];

  for (let round = 0; round < 300; round++) {
    const width = 1 + random(9);
    const height = 1 + random(9);
    const header = new Uint8Array(40);
    const view = new DataView(header.buffer);

    view.setUint32(0, 40, true);
    view.setInt32(4, width, true);
    view.setInt32(8, height * 2 * (random(2) ? 1 : -1), true);
    view.setUint16(12, 1, true);
    view.setUint16(14, [1, 4, 8, 24, 32][random(5)], true);
    view.setUint32(32, random(2) ? 0 : random(20), true);

    const file = Uint8Array.from([...header, ...createBytes(random, random(2000))]);
    const image = attempt(() => decodeDib(file));

    parts.push(
      image === 'rejected'
        ? image
        : `${image.width}x${image.height}:${Buffer.from(image.pixels).toString('hex')}`,
    );
  }

  return digest(parts);
};

export const computeDecoderDigests = (): Record<string, string> => ({
  tga: tgaDigest(),
  dds: ddsDigest(),
  uncompressedDds: uncompressedDdsDigest(),
  png: pngDigest(),
  transform: transformDigest(),
  dib: dibDigest(),
});
