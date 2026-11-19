import { findPointerTargetAt } from './hitTest';
import type { Instance } from './instance';
import type { Player } from './player';
import type { HitArea } from './scene';

export interface StageTool {
  down(point: [number, number], event: MouseEvent): boolean;
  move(point: [number, number], event: MouseEvent): boolean;
  up(): void;
  draw(ctx: CanvasRenderingContext2D, pixel: number): void;
  cursor(point: [number, number]): string | undefined;
}

export interface StagePointerHost {
  tools: readonly StageTool[];
  isInteractive(): boolean;
  hasMovie(): boolean;
  getPlayer(): Player;
  getHits(): readonly HitArea[];
  pointAt(event: MouseEvent): [number, number];
  findInstanceAt(point: [number, number], deep?: boolean): Instance | undefined;
  inspect(instance: Instance | undefined): void;
  render(): void;
}

export interface StagePointer {
  getHovered(): Instance | undefined;
  reset(): void;
  updateAfterFrame(): boolean;
}

export const attachStagePointer = (
  canvas: HTMLCanvasElement,
  host: StagePointerHost,
): StagePointer => {
  let hovered: Instance | undefined;
  let pressed: Instance | undefined;
  let isDown = false;
  let pointer: [number, number] | undefined;
  let holder: StageTool | undefined;

  const updateHover = (point: [number, number]): boolean => {
    const next = findPointerTargetAt(host.getHits(), point);

    canvas.style.cursor = next ? 'pointer' : 'default';
    if (next === hovered) {
      return false;
    }
    host.getPlayer().hover(hovered, next, isDown);
    hovered = next;
    return true;
  };

  const inspectAt = (point: [number, number]) => {
    const next = host.findInstanceAt(point);

    canvas.style.cursor =
      host.tools.map((each) => each.cursor(point)).find(Boolean) ?? 'default';
    if (next !== hovered) {
      hovered = next;
      canvas.title = next ? next.path || 'the shown character' : '';
      host.render();
    }
  };

  canvas.addEventListener('mousemove', (event) => {
    if (!host.hasMovie()) {
      return;
    }

    const point = host.pointAt(event);

    if (!host.isInteractive() && holder?.move(point, event)) {
      return;
    }

    pointer = point;
    if (!host.isInteractive()) {
      inspectAt(point);
    } else if (updateHover(point)) {
      host.render();
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (host.isInteractive() && hovered) {
      host.getPlayer().hover(hovered, undefined, isDown);
    }
    hovered = undefined;
    pointer = undefined;
    if (host.hasMovie()) {
      host.render();
    }
  });

  canvas.addEventListener('mousedown', (event) => {
    if (!host.hasMovie()) {
      return;
    }

    const point = host.pointAt(event);

    pointer = point;
    if (host.isInteractive()) {
      updateHover(point);
      isDown = true;
      pressed = hovered;
      if (hovered) {
        host.getPlayer().press(hovered);
      }
      host.render();
      return;
    }

    holder = host.tools.find((each) => each.down(point, event));
    if (!holder) {
      host.inspect(host.findInstanceAt(point, event.detail >= 2));
    }
  });

  window.addEventListener('mouseup', () => {
    holder?.up();
    holder = undefined;
    if (!isDown || !host.isInteractive()) {
      isDown = false;
      return;
    }
    isDown = false;
    if (pressed) {
      host.getPlayer().release(pressed, hovered);
      pressed = undefined;
    }
    host.render();
  });

  return {
    getHovered: () => hovered,
    reset: () => {
      hovered = undefined;
      pressed = undefined;
      isDown = false;
    },
    updateAfterFrame: () =>
      host.isInteractive() &&
      !!pointer &&
      (!hovered || !!hovered.removed || hovered.visible === false) &&
      updateHover(pointer),
  };
};
