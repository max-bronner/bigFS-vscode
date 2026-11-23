import type { Rgb } from "./w3dMaterialChunks";

export const HOUSE_COLOR_INI = "data/ini/housecolor.ini";

export const PLAYER_COLOR_INI = "data/ini/multiplayer.ini";

export interface PlayerColour {
  name: string;
  colour: Rgb;
}

const MAX_PLAYER_COLOURS = 64;

export const DEFAULT_HOUSE_COLOUR: Rgb = [70 / 255, 91 / 255, 156 / 255];

export const parsePlayerColours = (text: string): PlayerColour[] => {
  const colours = new Map<string, PlayerColour>();
  let name: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const code = line.split(";")[0].trim();
    const header = /^MultiplayerColor\s+(\S+)/i.exec(code);
    const rgb = /^RGBColor\s*=\s*R:\s*(\d+)\s+G:\s*(\d+)\s+B:\s*(\d+)/i.exec(code);

    if (header) {
      name = header[1];
    } else if (/^End\b/i.test(code)) {
      name = undefined;
    } else if (rgb && name && (colours.size < MAX_PLAYER_COLOURS || colours.has(name.toLowerCase()))) {
      colours.set(name.toLowerCase(), {
        name: name.replace(/^Color(?=.)/i, ""),
        colour: [1, 2, 3].map((at) => Math.min(255, Number(rgb[at])) / 255) as Rgb,
      });
    }
  }
  return [...colours.values()];
};

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
