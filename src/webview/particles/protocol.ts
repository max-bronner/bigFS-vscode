import type { PlaySoundRequest, SoundReply } from '../../core/soundClip';
import type { FxListDef } from '../../formats/particles/particleIni';
import type { NumericField } from '../../formats/particles/particleValueEdits';
import type { ParticleDef } from '../../formats/particles/particleDef';
import type { KeyKind, KeyValue } from '../../formats/particles/particleKeys';
import type { ModelScene, SceneSkeleton } from '../../formats/w3d/w3dScene';
import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import type { ObjectComposition } from '../../game/objects/objectComposition';
import type { ObjectScene, SceneFocus } from '../../game/objects/objectScene';

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

export type ToPage =
  | SoundReply
  | SceneMessage
  | { kind: 'notice'; message: string }
  | { kind: 'model'; model?: { name: string; scene: ModelScene } }
  | { kind: 'object'; object: ObjectScene; focus: SceneFocus }
  | { kind: 'composition'; composition: ObjectComposition }
  | { kind: 'partModel'; name: string; scene?: ModelScene }
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
  | { kind: 'loadModel'; name: string }
  | { kind: 'loadAnimation'; name: string }
  | { kind: 'loadPartModel'; name: string }
  | { kind: 'loadPartAnimation'; name: string }
  | { kind: 'reset' }
  | { kind: 'apply' }
  | { kind: 'keys'; keyKind: KeyKind; keys: KeyValue[] }
  | { kind: 'reveal'; line: number }
  | PlaySoundRequest;
