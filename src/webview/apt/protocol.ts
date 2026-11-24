import type { PlaySoundRequest, SoundReply } from '../../core/soundClip';
import type { AptMovie, Frame } from '../../formats/apt/aptMovie';
import type { DatLocation, RuRun } from '../../formats/apt/aptGeometry';
import type {
  AptEdit,
  ConstItemChange,
} from '../../formats/apt/writer/aptEdit';
import type { Behaviour } from '../../formats/apt/aptBehaviour';
import type { AptInstruction } from '../../formats/apt/aptBytecode';
import type { Problem } from '../../formats/apt/aptIntegrity';
import type { ModelScene } from '../../formats/w3d/w3dScene';
import type {
  SuggestionKind,
  SuggestionOption,
} from '../../game/apt/suggestionKinds';

export interface EngineValues {
  overrides?: Record<string, string>;
  externs?: Record<string, string>;
  returns: Record<string, string>;
  images?: Record<string, string>;
  calls?: Record<string, string[]>;
  values?: Record<string, string>;
}

export type PageMovie = AptMovie & {
  name: string;
  origin?: string;
  spriteFrames: Record<number, Frame[]>;
  behaviours: Record<number, Behaviour>;
  shapes: Record<number, RuRun[]>;
  imageTextures: Record<number, string>;
  imageLocations: Record<number, DatLocation>;
  code?: Record<number, AptInstruction[]>;
  consts?: (string | number)[];
};

export interface PageMappedImage {
  texture: string;
  uv: [number, number, number, number];
  rotated: boolean;
  extent: [number, number];
}

export interface TexturePixels {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export type ToPage =
  | SoundReply
  | {
      kind: 'movie';
      summary: string;
      movie: PageMovie;
      textures: Record<string, TexturePixels>;
      library: Record<string, PageMovie>;
      unresolved: string[];
      origins: Record<string, string>;
      texts?: Record<string, string>;
      answers?: EngineValues;
    }
  | {
      kind: 'movieLoaded';
      name: string;
      error?: string;
      library?: Record<string, PageMovie>;
      textures?: Record<string, TexturePixels>;
      unresolved?: string[];
      origins?: Record<string, string>;
      texts?: Record<string, string>;
    }
  | {
      kind: 'mappedImages';
      images: Record<string, PageMappedImage | null>;
      textures: Record<string, TexturePixels>;
      jpegs?: Record<string, Uint8Array>;
    }
  | {
      kind: 'suggestions';
      field: SuggestionKind;
      options: SuggestionOption[];
    }
  | { kind: 'renderObject'; name: string; scene?: ModelScene; error?: string }
  | { kind: 'select'; character: number }
  | { kind: 'progress'; text: string }
  | { kind: 'integrity'; problems: Problem[] }
  | {
      kind: 'script';
      block: number;
      text: string;
      mode: 'script' | 'assembly' | 'listing';
      note?: string;
    }
  | { kind: 'scriptSaved'; block: number; previous: number }
  | { kind: 'notice'; message: string }
  | { kind: 'error'; message: string };

export type FromPage =
  | { kind: 'ready' }
  | { kind: 'mappedImages'; names: string[] }
  | { kind: 'suggestions'; field: SuggestionKind }
  | { kind: 'renderObject'; name: string }
  | { kind: 'script'; block: number }
  | { kind: 'engineAnswers'; values: EngineValues }
  | { kind: 'keepSettings'; settings: Record<string, unknown> }
  | { kind: 'loadMovie'; name: string }
  | PlaySoundRequest
  | { kind: 'edit'; edit: AptEdit }
  | { kind: 'scriptEdit'; block: number; text: string }
  | { kind: 'openGeometry'; geometry: number }
  | { kind: 'openMovie'; name: string; character?: number }
  | { kind: 'removeCharacter'; id: number }
  | { kind: 'constEdit'; change: ConstItemChange }
  | { kind: 'manageMovie'; action: 'rename' | 'delete' }
  | { kind: 'openScript'; block: number; label: string }
  | {
      kind: 'addScript';
      label: string;
      to:
        | { kind: 'frame'; timeline: number; frame: number }
        | { kind: 'button'; id: number; condition: number }
        | { kind: 'clip'; offset: number; events: number };
    }
  | { kind: 'geometry'; shape: number; runs: RuRun[] }
  | {
      kind: 'importTexture';
      width: number;
      height: number;
      pixels: Uint8Array;
      assign?: { shape: number; run: number; runs: RuRun[] };
    };

export interface AptToolbar {
  zoom: string;
  speed: number;
  origin: boolean;
  boxes: boolean;
  masks: boolean;
  scripts: boolean;
  interact: boolean;
  wireframe: boolean;
}

export const ZOOMS = ['fit', '0.5', '1', '2'];

export const SPEEDS = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8];
