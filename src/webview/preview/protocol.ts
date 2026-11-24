import type {
  AnimationStep,
  CursorFrame,
} from '../../formats/cursor/cursorFrame';
import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import type { ForeignClip } from '../../formats/w3d/w3dModelFinder';
import type { ModelScene, SceneSkeleton } from '../../formats/w3d/w3dScene';
import type { RelatedModel } from '../../game/objects/findRelatedModels';
import type { TextureVariant } from '../../game/objects/objectAppearance';
import type { DetailFiles } from '../../game/objects/detailModels';
import type { TextureLayers } from '../../formats/w3d/w3dTextureSwaps';

export interface ModelMessage extends ModelScene {
  shownOn?: string;
  relatedFile?: string;
  detail?: DetailFiles;
  isRetextured?: boolean;
}

export interface FileLocation {
  container: string;
  detail: string;
}

export interface FileUse {
  uri: string;
  line: number;
  field: string;
  owner?: string;
  location?: FileLocation;
}

export interface TextureMessage {
  kind: 'texture';
  format: string;
  hasAlpha: boolean;
  levels: { width: number; height: number; pixels: Uint8Array }[];
}

export interface TextureRegion {
  id: string;
  label: string;
  group: string;
  rect: [number, number, number, number];
  rotated: boolean;
  editable: boolean;
  note?: string;
  source?: { uri: string; line: number };
  location?: FileLocation;
}

export interface RegionsMessage {
  kind: 'regions';
  regions: TextureRegion[];
  append?: boolean;
  selected?: string;
  loading?: boolean;
}

export interface AudioMessage {
  kind: 'audio';
  wav: Uint8Array;
  info: {
    format: string;
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
    durationSeconds: number;
  };
}

export interface VideoMessage {
  kind: 'video';
  width: number;
  height: number;
  frameCount: number;
  framesPerSecond: number;
  hasAlpha: boolean;
}

export interface CursorMessage {
  kind: 'cursor';
  frames: CursorFrame[];
  steps?: AnimationStep[];
}

export type ToPreviewPage =
  | TextureMessage
  | RegionsMessage
  | AudioMessage
  | VideoMessage
  | CursorMessage
  | ({ kind: 'model' } & ModelMessage)
  | { kind: 'error'; message: string }
  | { kind: 'animations'; own: string[]; foreign: ForeignClip[] }
  | { kind: 'uses'; uses: FileUse[] }
  | {
      kind: 'related';
      file: string;
      files: RelatedModel[];
      textures: TextureVariant[];
    }
  | {
      kind: 'animation';
      file: string;
      animation: W3dAnimation;
      skeleton?: SceneSkeleton;
    }
  | { kind: 'animationError'; message: string }
  | { kind: 'modelError'; file: string; message: string }
  | { kind: 'videoFrame'; index: number; pixels: Uint8Array }
  | { kind: 'videoError'; message: string };

export type FromPreviewPage =
  | { kind: 'ready' }
  | { kind: 'popOut' }
  | { kind: 'keepSettings'; settings: Record<string, unknown> }
  | {
      kind: 'editRegion';
      id: string;
      rect: [number, number, number, number];
    }
  | { kind: 'reveal'; uri: string; line: number }
  | { kind: 'previewObject'; uri: string; line: number }
  | { kind: 'animation'; file: string }
  | {
      kind: 'showModel';
      file?: string;
      textures?: TextureLayers;
    }
  | { kind: 'videoFrame'; index: number }
  | { kind: 'saveCursorFrame'; index: number };
