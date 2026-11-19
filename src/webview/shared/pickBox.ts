export type Box = [number, number, number, number];

export type BoxGrab =
  | 'move'
  | { anchor: [number, number]; handle: [number, number] };

export const getBoxCorners = ([left, top, right, bottom]: Box): [
  number,
  number,
][] => [
  [left, top],
  [right, top],
  [right, bottom],
  [left, bottom],
];

export const pickBox = (
  box: Box,
  point: readonly [number, number],
  reach: number,
): BoxGrab | undefined => {
  const corners = getBoxCorners(box);
  const near = corners.findIndex(
    ([x, y]) => Math.hypot(x - point[0], y - point[1]) <= reach,
  );

  if (near >= 0) {
    return { anchor: corners[(near + 2) % 4], handle: corners[near] };
  }
  return point[0] >= box[0] &&
    point[0] <= box[2] &&
    point[1] >= box[1] &&
    point[1] <= box[3]
    ? 'move'
    : undefined;
};
