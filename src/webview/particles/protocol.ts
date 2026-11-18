import type {
  FxListDef,
  NumericField,
  ParticleDef,
} from '../../formats/particles/particleIni';
import type { KeyKind, KeyValue } from '../../formats/particles/particleKeys';
import type { ModelScene } from '../../formats/w3d/w3dScene';
import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
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
  | SceneMessage
  | { kind: 'notice'; message: string }
  | { kind: 'model'; model?: { name: string; scene: ModelScene } }
  | { kind: 'object'; object: ObjectScene; focus: SceneFocus }
  | { kind: 'animation'; name: string; animation?: W3dAnimation };

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
  | { kind: 'reset' }
  | { kind: 'apply' }
  | { kind: 'keys'; keyKind: KeyKind; keys: KeyValue[] }
  | { kind: 'reveal'; line: number }
  | { kind: 'playSound'; name: string };
