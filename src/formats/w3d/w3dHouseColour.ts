import type { Rgb } from "./w3dMaterialChunks";

export const HOUSE_COLOR_INI = "data/ini/housecolor.ini";

export const DEFAULT_HOUSE_COLOUR: Rgb = [70 / 255, 91 / 255, 156 / 255];

export const parseHouseColours = (text: string): Map<string, string> => {
  const masks = new Map<string, string>();
  let base: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const [key, value] = line.split(";")[0].split("=").map((part) => part.trim());

    if (/^HouseColor$/i.test(key)) {
      base = undefined;
    } else if (/^BaseTexture$/i.test(key) && value) {
      base = value.toLowerCase();
    } else if (/^HouseTexture$/i.test(key) && value && base) {
      masks.set(base, value);
    }
  }
  return masks;
};
