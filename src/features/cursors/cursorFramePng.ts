import type { CursorFrame } from '../../formats/cursor/cursorFrame';
import { parseCursorFile } from '../../formats/cursor/parseCursorFile';
import { decodePng, encodePng } from '../../node/png';

export interface CursorFramePng {
  name: string;
  frame: CursorFrame;
  png: Uint8Array;
}

export const getFramePngName = (cursorName: string, frameIndex: number, frameCount: number): string => {
  const baseName = cursorName.replace(/\.[^.]+$/, '');

  if (frameCount === 1) {
    return `${baseName}.png`;
  }

  const digits = Math.max(2, String(frameCount).length);

  return `${baseName}_frame${String(frameIndex + 1).padStart(digits, '0')}.png`;
};

export const encodeCursorFramePng = (
  bytes: Uint8Array,
  cursorName: string,
  frameIndex: number,
): CursorFramePng => {
  const { frames } = parseCursorFile(bytes, { decodePng });
  const frame = Number.isInteger(frameIndex) ? frames[frameIndex] : undefined;

  if (!frame) {
    throw new Error(`${cursorName} has no frame ${frameIndex + 1}; it holds ${frames.length}`);
  }

  return { name: getFramePngName(cursorName, frameIndex, frames.length), frame, png: encodePng(frame) };
};
