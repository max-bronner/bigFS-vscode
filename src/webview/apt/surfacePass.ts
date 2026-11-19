import type { Player } from './player';

export interface SurfacePass {
  player: Player;
  pass: number;
  isPlaying: boolean;
}
