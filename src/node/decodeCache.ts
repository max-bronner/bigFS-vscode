import { createHash } from 'node:crypto';
import type { Tool, ToolBox } from '../core/toolRegistry';
import { decodeDdsTool, decodeTgaTool } from '../formats/texture/textureTools';
import type { DecodedTexture, RgbaImage } from '../formats/texture/textureTools';
import type { DecodePng, SceneTexture } from '../formats/w3d/w3dSceneDraws';

const MAX_DECODED_BYTES = 160 * 1024 * 1024;

const hash = (bytes: Uint8Array) => createHash('sha1').update(bytes).digest('base64');

export interface DecodeCache {
  tools: ToolBox;
  decodePng: DecodePng;
  getDigest(texture: SceneTexture): string;
}

export const createDecodeCache = (
  base: ToolBox,
  decodePng: DecodePng,
  maxBytes = MAX_DECODED_BYTES,
): DecodeCache => {
  const kept = new Map<string, { decoded: DecodedTexture; bytes: number }>();
  const pending = new Map<string, Promise<DecodedTexture>>();
  const digests = new WeakMap<Uint8Array, string>();
  const jpegDigests = new WeakMap<Uint8Array, { jpeg: Uint8Array; digest: string }>();
  let total = 0;

  const keep = (key: string, decoded: DecodedTexture) => {
    const [image] = decoded.levels;

    if (!image || image.pixels.byteLength > maxBytes) {
      return;
    }
    digests.set(image.pixels, key);
    kept.set(key, { decoded, bytes: image.pixels.byteLength });
    total += image.pixels.byteLength;
    for (const [oldest, { bytes }] of kept) {
      if (total <= maxBytes) {
        break;
      }
      kept.delete(oldest);
      total -= bytes;
    }
  };

  const find = (key: string) => {
    const found = kept.get(key);

    if (found) {
      kept.delete(key);
      kept.set(key, found);
    }
    return found?.decoded;
  };

  const decodeOnce = (id: string, decode: (bytes: Uint8Array) => Promise<DecodedTexture>) =>
    async (bytes: Uint8Array): Promise<DecodedTexture> => {
      const key = `${id}:${hash(bytes)}`;
      const found = find(key);

      if (found) {
        return found;
      }

      let decoding = pending.get(key);

      if (!decoding) {
        decoding = decode(bytes)
          .then((decoded) => {
            const slim = { ...decoded, levels: decoded.levels.slice(0, 1) };

            keep(key, slim);
            return slim;
          })
          .finally(() => pending.delete(key));
        pending.set(key, decoding);
      }
      return decoding;
    };

  const tools: ToolBox = {
    use<Input, Output>(tool: Tool<Input, Output>) {
      const run = base.use(tool);

      return tool.id === decodeDdsTool.id || tool.id === decodeTgaTool.id
        ? (decodeOnce(tool.id, run as never) as never)
        : run;
    },
  };

  const getHash = (bytes: Uint8Array) => {
    let digest = digests.get(bytes);

    if (digest === undefined) {
      digest = hash(bytes);
      digests.set(bytes, digest);
    }
    return digest;
  };

  const getJpegHash = (pixels: Uint8Array, jpeg: Uint8Array) => {
    const known = jpegDigests.get(pixels);

    if (known && Buffer.compare(known.jpeg, jpeg) === 0) {
      return known.digest;
    }

    const digest = hash(jpeg);

    jpegDigests.set(pixels, { jpeg, digest });
    return digest;
  };

  return {
    tools,
    decodePng: (bytes) => {
      const key = `png:${hash(bytes)}`;
      const found = find(key)?.levels[0];

      if (found) {
        return found;
      }

      const image: RgbaImage = decodePng(bytes);

      keep(key, { format: 'PNG', hasAlpha: true, levels: [image] });
      return image;
    },
    getDigest: ({ width, height, pixels, luminanceJpeg }) =>
      `${width}x${height}:${getHash(pixels)}:${luminanceJpeg ? getJpegHash(pixels, luminanceJpeg) : ''}`,
  };
};
