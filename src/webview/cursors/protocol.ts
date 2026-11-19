import type { CursorFrame } from '../../formats/cursor/cursorFrame';

export interface BuilderImage extends CursorFrame {
  name: string;
}

export type ToBuilderPage =
  | { kind: 'images'; images: BuilderImage[] }
  | { kind: 'error'; message: string };

export type FromBuilderPage =
  | { kind: 'ready' }
  | { kind: 'addImages' }
  | { kind: 'save'; bytes: Uint8Array };
