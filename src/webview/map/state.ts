import type { MapMode } from './modeText';
import type { HeightsView, MapView } from './protocol';

export type MapDrag =
  | { kind: 'object'; index: number; moved: boolean }
  | { kind: 'vertex'; area: number; vertex: number; moved: boolean };

export interface ReliefSurface {
  surface: HTMLCanvasElement;
  low: number;
  high: number;
}

export interface MapLayers {
  objects: boolean;
  waypoints: boolean;
  links: boolean;
  starts: boolean;
  boundary: boolean;
  areas: boolean;
}

export interface MapState {
  map: MapView;
  heights: HeightsView | undefined;
  selected: number | undefined;
  selectedArea: number | undefined;
  filter: string;
  layers: MapLayers;
  relief: ReliefSurface | undefined;
  readOnly: boolean;
  mode: MapMode | undefined;
  draft: [number, number][];
  drag: MapDrag | undefined;
  pendingSelect: number | undefined;
}

const EMPTY_MAP: MapView = {
  compression: 'none',
  worldInfo: [],
  timeOfDay: undefined,
  lights: undefined,
  teams: [],
  scripts: [],
  triggerAreas: [],
  waypointLinks: [],
  sides: [],
  objects: [],
  chunks: [],
  problems: [],
};

export const state: MapState = {
  map: EMPTY_MAP,
  heights: undefined,
  selected: undefined,
  selectedArea: undefined,
  filter: '',
  layers: {
    objects: true,
    waypoints: true,
    links: true,
    starts: true,
    boundary: true,
    areas: true,
  },
  relief: undefined,
  readOnly: false,
  mode: undefined,
  draft: [],
  drag: undefined,
  pendingSelect: undefined,
};
