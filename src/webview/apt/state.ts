import type { PageMovie } from './protocol';

export interface PageState {
  movie?: PageMovie;
  library: Map<string, PageMovie>;
  selected: number;
  frame: number;
  tick: number;
  textures: Map<string, HTMLCanvasElement>;
  inspected?: string;
  drafts: Map<number, string>;
  cards: Map<string, boolean>;
}

export const state: PageState = {
  library: new Map(),
  selected: 0,
  frame: 0,
  tick: 0,
  textures: new Map(),
  drafts: new Map(),
  cards: new Map(),
};

export const movie = (): PageMovie => state.movie!;
