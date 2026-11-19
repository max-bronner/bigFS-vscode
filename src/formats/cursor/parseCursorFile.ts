import type {
  AnimationStep,
  CursorFrame,
  CursorParseOptions,
} from './cursorFrame';
import { parseAni } from './parseAni';
import { parseCur } from './parseCur';

export interface ParsedCursorFile {
  frames: CursorFrame[];
  steps?: AnimationStep[];
}

export const parseCursorFile = (
  bytes: Uint8Array,
  options: CursorParseOptions = {},
): ParsedCursorFile =>
  String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    ? parseAni(bytes, options)
    : { frames: parseCur(bytes, options) };
