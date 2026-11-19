import type { Character, Frame, Matrix2 } from '../../formats/apt/aptMovie';
import type { PageMovie } from './protocol';
import type { ColorTransform } from './timeline';

export interface Instance {
  path: string;
  movie: PageMovie;
  id: number;
  character?: Character;
  missing?: string;
  parent?: Instance;
  name?: string;
  matrix: Matrix2;
  translate: [number, number];
  alpha: number;
  clipDepth?: number;
  clipActions?: { events: number; block: number }[];
  tint?: ColorTransform;
  visible?: boolean;
  text?: string;
  scripted?: boolean;
  dynamic?: boolean;
  removed?: boolean;
  born: number;
  placed: number;
  placedItem?: number;
  matrixItem?: number;
  frames: Frame[];
  frame: number;
  playing: boolean;
  children: Map<string, Instance>;
  hits: Instance[];
  isHitRecord?: boolean;
  buttonState: number;
  forced?: number;
}

export const isTimeline = (instance: Instance): boolean =>
  instance.character?.type === 'sprite' || instance.character?.type === 'movie';
