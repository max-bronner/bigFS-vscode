import { parseMappedImage } from './mappedImage';
import type { MappedImage, MappedRect } from './mappedImage';

const HEADER = /^\s*MappedImage\s+(\S+)/i;
const END = /^\s*End\b/i;
const COORDS_LINE = /^(\s*Coords\s*=\s*)([^;]*?)(\s*(?:;.*)?)$/i;
const TEXTURE_LINE = /^(\s*)Texture\s*=/i;

export interface LineEdit {
  line: number;
  start: number;
  end: number;
  text: string;
  insertsLine?: boolean;
}

export interface MappedImageBlock {
  image: MappedImage;
  endLine: number;
}

export const findMappedImageHeader = (
  lines: readonly string[],
  line: number,
): number | undefined => {
  for (let at = line; at >= 0; at--) {
    if (HEADER.test(lines[at] ?? '')) {
      return at;
    }
    if (at < line && END.test(lines[at] ?? '')) {
      return undefined;
    }
  }
  return undefined;
};

export const readMappedImageBlock = (
  lines: readonly string[],
  header: number,
): MappedImageBlock | undefined => {
  const name = HEADER.exec(lines[header] ?? '')?.[1];
  const endLine = lines.findIndex((line, at) => at > header && END.test(line));

  if (!name || endLine < 0) {
    return undefined;
  }

  return {
    image: parseMappedImage(name, lines.slice(header + 1, endLine)),
    endLine,
  };
};

export const locateMappedImageBlock = (
  lines: readonly string[],
  name: string,
  line: number,
): number | undefined => {
  const isHeader = (text: string | undefined) =>
    HEADER.exec(text ?? '')?.[1].toLowerCase() === name.toLowerCase();

  if (isHeader(lines[line])) {
    return line;
  }

  const found = lines.findIndex(isHeader);

  return found < 0 ? undefined : found;
};

export const formatCoords = (rect: MappedRect): string =>
  `Left:${rect.left} Top:${rect.top} Right:${rect.right} Bottom:${rect.bottom}`;

export const getCoordsEdit = (
  lines: readonly string[],
  header: number,
  rect: MappedRect,
): LineEdit | undefined => {
  const block = readMappedImageBlock(lines, header);

  if (!block) {
    return undefined;
  }

  const value = formatCoords(rect);

  for (let at = header + 1; at < block.endLine; at++) {
    const match = COORDS_LINE.exec(lines[at]);

    if (match) {
      return {
        line: at,
        start: match[1].length,
        end: match[1].length + match[2].length,
        text: value,
      };
    }
  }

  const indent =
    lines
      .slice(header + 1, block.endLine)
      .map((line) => TEXTURE_LINE.exec(line)?.[1])
      .find((found) => found !== undefined) ?? '  ';

  return {
    line: block.endLine,
    start: 0,
    end: 0,
    text: `${indent}Coords = ${value}`,
    insertsLine: true,
  };
};
