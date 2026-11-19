import type { AnimatedCursor, CursorFrame } from './cursorFrame';

export interface AnimationRow {
  frame: CursorFrame;
  jiffies: number;
}

export const buildAnimation = (rows: AnimationRow[]): AnimatedCursor => ({
  frames: rows.map((row) => row.frame),
  steps: rows.map((row, frame) => ({ frame, jiffies: row.jiffies })),
});
