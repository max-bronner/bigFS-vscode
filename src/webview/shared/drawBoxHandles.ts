import { getBoxCorners } from './pickBox';
import type { Box } from './pickBox';

export const HANDLE_RADIUS = 5;

export const drawBoxHandles = (
  ctx: CanvasRenderingContext2D,
  box: Box,
  scale: number,
): void => {
  const radius = HANDLE_RADIUS / scale;

  ctx.fillStyle = 'white';
  for (const [x, y] of getBoxCorners(box)) {
    ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
    ctx.strokeRect(x - radius, y - radius, 2 * radius, 2 * radius);
  }
};
