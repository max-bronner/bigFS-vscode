export interface CursorFrame {
  width: number;
  height: number;
  hotspotX: number;
  hotspotY: number;
  pixels: Uint8Array;
}

export interface AnimationStep {
  frame: number;
  jiffies: number;
}

export interface AnimatedCursor {
  frames: CursorFrame[];
  steps: AnimationStep[];
}

export type PngDecoder = (bytes: Uint8Array) => {
  width: number;
  height: number;
  pixels: Uint8Array;
};

export interface CursorParseOptions {
  decodePng?: PngDecoder;
}
