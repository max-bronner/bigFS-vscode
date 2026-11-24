import type { PlaySoundRequest, SoundReply } from '../../core/soundClip';
import type { FxListDef } from '../../formats/particles/particleIni';
import type { NumericField } from '../../formats/particles/particleValueEdits';
import type { ParticleDef } from '../../formats/particles/particleDef';
import type { KeyKind, KeyValue } from '../../formats/particles/particleKeys';
import type { ModelScene, SceneSkeleton } from '../../formats/w3d/w3dScene';
import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import type { ObjectComposition, PartStatePicks } from '../../game/objects/objectComposition';
import type { ObjectScene, SceneFocus } from '../../game/objects/objectScene';
import type { AbilityGroup } from '../../game/objects/objectAbilities';
import type { AppearanceChoice } from '../../game/objects/objectAppearance';
import type { TextureLayers } from '../../formats/w3d/w3dTextureSwaps';
import type { DetailLevel } from '../../game/objects/detailModels';
import type { PreloadPlan } from '../../game/objects/listPreloads';
import type { SentScene } from '../../formats/w3d/w3dSceneTransfer';

export interface SceneMessage {
  kind: 'scene';
  restart: boolean;
  root?: { kind: 'fxList' | 'system'; name: string; line: number };
  systems: Record<string, ParticleDef>;
  fxLists: Record<string, FxListDef>;
  textures: Record<string, string | null>;
  notes: string[];
  fields: NumericField[];
  values: Record<string, number>;
  comparing: boolean;
  budgets: { lod: string; max: number }[];
}

export interface ObjectDefinitionPlace {
  keyword: string;
  parent?: string;
  file: string;
  line: number;
}

export type ToPage =
  | SoundReply
  | SceneMessage
  | { kind: 'notice'; message: string }
  | { kind: 'model'; model?: { name: string; scene: ModelScene } }
  | { kind: 'decal'; name: string; url: string | null }
  | {
      kind: 'object';
      object: ObjectScene;
      focus: SceneFocus;
      definition?: ObjectDefinitionPlace;
    }
  | { kind: 'composition'; composition: ObjectComposition }
  | {
      kind: 'partEffects';
      systems: SceneMessage['systems'];
      fxLists: SceneMessage['fxLists'];
      textures: SceneMessage['textures'];
    }
  | {
      kind: 'abilities';
      groups: AbilityGroup[];
      systems: SceneMessage['systems'];
      fxLists: SceneMessage['fxLists'];
      textures: SceneMessage['textures'];
    }
  | {
      kind: 'partModel';
      name: string;
      textures?: TextureLayers;
      detail?: DetailLevel;
      scene?: SentScene;
      error?: string;
    }
  | { kind: 'preloadPlan'; plan: PreloadPlan }
  | { kind: 'forgetModels' }
  | { kind: 'forgetTextures' }
  | {
      kind: 'partAnimation';
      name: string;
      animation?: W3dAnimation;
      skeleton?: SceneSkeleton;
    }
  | {
      kind: 'animation';
      name: string;
      animation?: W3dAnimation;
      skeleton?: SceneSkeleton;
    };

export type FromPage =
  | { kind: 'ready' }
  | { kind: 'status'; frame: number; systems: number; particles: number }
  | { kind: 'set'; id: string; value: number }
  | { kind: 'setMany'; values: Record<string, number> }
  | { kind: 'compare'; on: boolean }
  | { kind: 'variant'; name?: string }
  | { kind: 'pickModel' }
  | { kind: 'loadAnimation'; name: string }
  | { kind: 'loadPartModel'; name: string; textures?: TextureLayers; detail?: DetailLevel }
  | { kind: 'setAppearance'; choice: AppearanceChoice }
  | { kind: 'setPartStates'; states: PartStatePicks }
  | { kind: 'loadPartAnimation'; name: string }
  | { kind: 'planPreload'; choices: AppearanceChoice[] }
  | { kind: 'loadDecal'; name: string }
  | { kind: 'showState'; state?: number; conditions?: string[] }
  | { kind: 'reset' }
  | { kind: 'apply' }
  | { kind: 'keys'; keyKind: KeyKind; keys: KeyValue[] }
  | { kind: 'reveal'; line: number }
  | { kind: 'revealDefinition' }
  | { kind: 'showEffectiveDefinition' }
  | { kind: 'keepSettings'; settings: Record<string, unknown> }
  | PlaySoundRequest;
