export interface Size {
  width: number;
  height: number;
}

export const MIN_FIT_SCALE = 1 / 32;

export const getFitScale = (room: Size, texture: Size): number =>
  Math.max(
    MIN_FIT_SCALE,
    Math.min(1, room.width / texture.width, room.height / texture.height),
  );
