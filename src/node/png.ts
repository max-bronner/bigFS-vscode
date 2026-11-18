import { deflateSync, inflateSync } from "zlib";
import {
  decodePng as decodePngWith,
  encodePng as encodePngWith,
} from "../formats/texture/textureEncode";

type RgbaImage = Parameters<typeof encodePngWith>[0];

export const encodePng = (image: RgbaImage): Uint8Array =>
  encodePngWith(image, deflateSync);

export const decodePng = (bytes: Uint8Array): RgbaImage =>
  decodePngWith(bytes, (data, maxOutputLength) =>
    inflateSync(data, { maxOutputLength }),
  );
