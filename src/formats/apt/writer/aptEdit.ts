import type { Matrix2, Rect } from '../aptMovie';
import type { FrameSpec, TimelineOperation } from '../aptTimeline';

export type CharacterChange =
  | { field: 'bounds'; value: Rect }
  | { field: 'matrix'; value: Matrix2 }
  | { field: 'translate'; value: [number, number] }
  | { field: 'glyphs'; value: number[] }
  | { field: 'text' | 'variable' | 'fontName'; value: string | undefined }
  | {
      field:
        | 'color'
        | 'fontHeight'
        | 'alignment'
        | 'font'
        | 'readonly'
        | 'multiline'
        | 'wordwrap'
        | 'texture'
        | 'geometry'
        | 'startShape'
        | 'endShape';
      value: number;
    };

export interface PlacementChange {
  character?: number;
  depth?: number;
  matrix?: Matrix2;
  translate?: [number, number];
  colorTransform?: number;
  colorAdd?: number;
  ratio?: number;
  name?: string;
  clipDepth?: number;
  isMove?: boolean;
  clear?: PlacementField[];
}

export type PlacementField =
  | 'character'
  | 'matrix'
  | 'colorTransform'
  | 'ratio'
  | 'name'
  | 'clipDepth';

export interface TextRecordChange {
  font?: number;
  color?: [number, number, number, number];
  unknown?: Rect;
  penOffset?: [number, number];
  textHeight?: number;
  glyphs?: { index: number; advance: number }[];
}

export interface ConstItemChange {
  index: number;
  value: string | number;
}

export type AptEdit =
  | { kind: 'character'; id: number; change: CharacterChange }
  | { kind: 'placement'; offset: number; change: PlacementChange }
  | {
      kind: 'buttonRecord';
      offset: number;
      flags?: number;
      matrix?: Matrix2;
      translate?: [number, number];
      character?: number;
      depth?: number;
      color?: [number, number, number, number];
      unknown?: [number, number, number, number];
    }
  | {
      kind: 'frameLabel';
      offset: number;
      label?: string;
      flags?: number;
      frame?: number;
    }
  | { kind: 'backgroundColor'; offset: number; color: number }
  | {
      kind: 'addBackgroundColor';
      timeline: number;
      frame: number;
      color: number;
    }
  | { kind: 'initAction'; offset: number; sprite: number }
  | { kind: 'removeObjectDepth'; offset: number; depth: number }
  | { kind: 'textRecord'; id: number; index: number; change: TextRecordChange }
  | { kind: 'addTextRecord'; id: number; font: number }
  | { kind: 'removeTextRecord'; id: number; index: number }
  | { kind: 'movieUnknown36'; value: number }
  | { kind: 'export'; index: number; name?: string; character?: number }
  | { kind: 'addExport'; name: string; character: number }
  | { kind: 'removeExport'; index: number }
  | {
      kind: 'import';
      index: number;
      movie?: string;
      name?: string;
      character?: number;
    }
  | { kind: 'addImport'; movie: string; name: string }
  | { kind: 'removeImport'; index: number }
  | { kind: 'screen'; width: number; height: number }
  | { kind: 'duplicateCharacter'; id: number }
  | {
      kind: 'addCharacter';
      type: 'editText' | 'sprite' | 'shape' | 'image' | 'button';
    }
  | {
      kind: 'addButtonRecord';
      id: number;
      flags: number;
      character: number;
      depth: number;
      matrix?: Matrix2;
      translate?: [number, number];
      color?: [number, number, number, number];
      unknown?: [number, number, number, number];
    }
  | { kind: 'removeButtonRecord'; id: number; index: number }
  | { kind: 'moveButtonRecord'; id: number; from: number; to: number }
  | { kind: 'removeCharacter'; id: number }
  | {
      kind: 'placeObject';
      timeline: number;
      frame: number;
      depth: number;
      character: number;
      translate?: [number, number];
      matrix?: Matrix2;
      name?: string;
    }
  | { kind: 'removeObject'; timeline: number; frame: number; depth: number }
  | { kind: 'addFrameLabel'; timeline: number; frame: number; label: string }
  | { kind: 'removeItem'; timeline: number; frame: number; offset: number }
  | {
      kind: 'moveItem';
      timeline: number;
      frame: number;
      from: number;
      to: number;
    }
  | { kind: 'addFrame'; timeline: number }
  | { kind: 'addFrameScript'; timeline: number; frame: number; block: number }
  | { kind: 'addButtonAction'; id: number; condition: number; block: number }
  | { kind: 'buttonAction'; id: number; index: number; condition: number }
  | { kind: 'removeButtonAction'; id: number; index: number }
  | { kind: 'addClipAction'; offset: number; events: number; block: number }
  | { kind: 'clipAction'; offset: number; index: number; events: number }
  | { kind: 'removeClipAction'; offset: number; index: number }
  | { kind: 'swapDepths'; timeline: number; a: number; b: number }
  | { kind: 'setTimeline'; timeline: number; frames: FrameSpec[] }
  | { kind: 'timeline'; timeline: number; operation: TimelineOperation }
  | {
      kind: 'timelineScript';
      timeline: number;
      operations: TimelineOperation[];
    };

export interface EditResult {
  character?: number;
}
