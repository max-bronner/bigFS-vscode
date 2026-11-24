import type { PlaySoundRequest, SoundReply } from '../../core/soundClip';
import type { MapEdit } from '../../formats/map/mapEdit';
import type {
  DictValue,
  MapLight,
  MapWaypointLink,
} from '../../formats/map/mapFile';
import type { ScriptTreeNode } from '../shared/scriptTreeText';

export interface DictEntryView {
  key: string;
  value: DictValue;
}

export interface ObjectView {
  index: number;
  x: number;
  y: number;
  z: number;
  angle: number;
  template: string;
  properties: DictEntryView[];
}

export interface TriggerAreaView {
  name: string;
  id: number;
  points: [number, number][];
}

export interface MapView {
  compression: 'ear' | 'none';
  worldInfo: DictEntryView[];
  timeOfDay: number | undefined;
  lights: MapLight[] | undefined;
  teams: DictEntryView[][];
  scripts: ScriptTreeNode[][];
  triggerAreas: TriggerAreaView[];
  waypointLinks: MapWaypointLink[];
  sides: DictEntryView[][];
  objects: ObjectView[];
  chunks: { name: string; version: number; size: number }[];
  problems: string[];
}

export interface HeightsView {
  width: number;
  height: number;
  border: number;
  boundaries: [number, number][];
  samples: ArrayLike<number>;
}

export interface MapMessage {
  kind: 'map';
  readOnly: boolean;
  templates: string[] | undefined;
  map: MapView;
  heights: HeightsView | undefined;
}

export interface MapNotice {
  kind: 'notice' | 'error';
  message: string;
}

export type MapToPage = MapMessage | MapNotice | SoundReply;

export type FromMapPage =
  | { kind: 'ready' }
  | { kind: 'edit'; edit: MapEdit }
  | { kind: 'keepSettings'; settings: Record<string, unknown> }
  | PlaySoundRequest;

export type DictOwner = Extract<MapEdit, { kind: 'dict' }>['owner'];
