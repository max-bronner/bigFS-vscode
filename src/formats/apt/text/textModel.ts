import { PLACE_FLAGS } from '../aptMovie';
import type { Matrix2, Rect } from '../aptMovie';

export interface Origin {
  offset?: number;
  line?: number;
  endLine?: number;
}

export interface ScriptText {
  mode: 'as' | 'asm' | 'listing';
  text: string;
  block?: number;
  line?: number;
}

export interface Placement {
  matrix: Matrix2;
  translate: [number, number];
}

export type ItemText = Origin &
  (
    | { type: 'action'; script: ScriptText }
    | { type: 'label'; label: string; flags: number; frame: number }
    | {
        type: 'place';
        flags: number;
        depth: number;
        character?: number;
        placement?: Placement;
        colorTransform?: number;
        colorAdd?: number;
        ratio?: number;
        name?: string;
        clipDepth?: number;
        clipActions?: ClipActionText[];
      }
    | { type: 'remove'; depth: number }
    | { type: 'background'; color: number }
    | { type: 'initAction'; sprite: number; script: ScriptText }
    | { type: 'unknown'; itemType: number }
  );

export type ClipActionText = Origin & { events: number; script: ScriptText };

export interface FrameText extends Origin {
  index: number;
  items: ItemText[];
}

export type ButtonRecordText = Origin & {
  flags: number;
  depth: number;
  character: number;
  placement: Placement;
  color: [number, number, number, number];
  unknown: [number, number, number, number];
};

export type ButtonActionText = Origin & {
  condition: number;
  script: ScriptText;
};

export type TextRunText = Origin & {
  font: number;
  color: [number, number, number, number];
  unknown: Rect;
  penOffset: [number, number];
  textHeight: number;
  glyphs: { index: number; advance: number }[];
};

export type CharacterText = Origin & { id: number } & (
    | {
        type: 'movie';
        screen?: { width: number; height: number; unknown36: number };
        frames: FrameText[];
      }
    | { type: 'shape'; bounds: Rect; geometry: number }
    | {
        type: 'editText';
        bounds: Rect;
        font: number;
        alignment: number;
        color: number;
        fontHeight: number;
        readonly: number;
        multiline: number;
        wordwrap: number;
        text?: string;
        variable?: string;
      }
    | { type: 'font'; name?: string; glyphs: number[] }
    | {
        type: 'button';
        bounds: Rect;
        hitTriangles: number;
        records: ButtonRecordText[];
        actions: ButtonActionText[];
      }
    | { type: 'sprite'; frames: FrameText[] }
    | { type: 'image'; texture: number }
    | { type: 'morph'; startShape: number; endShape: number }
    | {
        type: 'text';
        bounds: Rect;
        placement: Placement;
        runs: TextRunText[];
      }
    | { type: 'placeholder' }
    | { type: 'unknown'; characterType: number }
  );

export type ConstText = Origin & { index: number; value: string | number };
export type ImportText = Origin & {
  character: number;
  movie: string;
  name: string;
};
export type ExportText = Origin & { character: number; name: string };

export interface MovieText {
  constants: ConstText[];
  imports: ImportText[];
  exports: ExportText[];
  characters: CharacterText[];
}

export interface TextProblem {
  line: number;
  column: number;
  endColumn: number;
  message: string;
}

export interface IdSite {
  id: number;
  line: number;
  column: number;
  endColumn: number;
  isDeclaration: boolean;
}

export const TEXT_HEADER = 'apt-text 1';

export interface ParsedMovieText {
  movie: MovieText;
  problems: TextProblem[];
  ids: IdSite[];
}

export const BUTTON_STATES = ['up', 'over', 'down', 'hit'];

export const normalizeScript = (text: string): string =>
  text.replace(/[ \t]+$/gm, '').replace(/\n+$/, '');

export const impliedPlaceFlags = (
  item: Extract<ItemText, { type: 'place' }>,
  isMove: boolean,
): number =>
  (isMove ? PLACE_FLAGS.move : 0) |
  (item.character !== undefined ? PLACE_FLAGS.hasCharacter : 0) |
  (item.placement ? PLACE_FLAGS.hasMatrix : 0) |
  (item.colorTransform !== undefined ? PLACE_FLAGS.hasColorTransform : 0) |
  (item.ratio !== undefined ? PLACE_FLAGS.hasRatio : 0) |
  (item.name !== undefined ? PLACE_FLAGS.hasName : 0) |
  (item.clipDepth !== undefined ? PLACE_FLAGS.hasClipDepth : 0) |
  (item.clipActions ? PLACE_FLAGS.hasClipActions : 0);
