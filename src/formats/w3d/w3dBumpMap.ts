import type { RgbaImage } from "../texture/textureTools";

export const buildBumpOffsets = ({ width, height, pixels }: RgbaImage): RgbaImage => {
  const count = width * height;
  const luminance = new Int32Array(count);

  for (let at = 0; at < count; at++) {
    const [red, green, blue] = [pixels[at * 4], pixels[at * 4 + 1], pixels[at * 4 + 2]];

    luminance[at] = ((blue * 0x1275 + green * 0xb725 + red * 0x3666) >>> 16) & 0xff;
  }

  const out = new Uint8Array(count * 4);

  for (let at = 0; at < count; at++) {
    const row = Math.floor(at / width);
    const mid = luminance[at];
    const left = luminance[Math.max(at - 1, 0)];
    const right = luminance[Math.min(at + 1, count - 1)];
    const above = row === 0 ? mid : luminance[at - width];
    const below = row + 1 === height ? mid : luminance[at + width];
    const du = mid < left && mid < right ? Math.max(left - mid, mid - right) : left - right;
    const dv = below - above;

    out[at * 4] = ((du << 24) >> 24) + 128;
    out[at * 4 + 1] = ((dv << 24) >> 24) + 128;
    out[at * 4 + 3] = 255;
  }

  return { width, height, pixels: out };
};
