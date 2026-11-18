import type { MapMode } from './modeText';

export interface MapActions {
  select(index: number | undefined): void;
  selectArea(index: number | undefined): void;
  setMode(mode: MapMode | undefined): void;
}
