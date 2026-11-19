import { union } from './scene';
import type { Rect } from '../../formats/apt/aptMovie';

export const growExtent = (
  extent: Rect,
  frameBox: Rect | undefined,
  { isScreen, isAnimating }: { isScreen: boolean; isAnimating: boolean },
): Rect =>
  frameBox && !isScreen && !isAnimating ? union([extent, frameBox])! : extent;
