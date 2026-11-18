import type { DictValue } from '../../formats/map/mapFile';
import type { HeightsView, ObjectView } from './protocol';

export const roundTo = (value: number): number => Math.round(value * 100) / 100;

export const isWaypoint = (object: ObjectView): boolean =>
  object.template.toLowerCase() === '*waypoints/waypoint';

export const nameOf = (object: ObjectView): string => {
  const entry = object.properties.find(
    (candidate) =>
      candidate.key === 'waypointName' || candidate.key === 'objectName',
  );

  return entry && entry.value.value ? String(entry.value.value) : '';
};

export const isStart = (object: ObjectView): boolean =>
  isWaypoint(object) && /^Player_\d+_Start$/i.test(nameOf(object));

export const idOf = (object: ObjectView): number | undefined => {
  const entry = object.properties.find(
    (candidate) => candidate.key === 'waypointID',
  );

  return entry && typeof entry.value.value === 'number'
    ? entry.value.value
    : undefined;
};

export const waypointsById = (
  objects: readonly ObjectView[],
): Map<number, ObjectView> => {
  const found = new Map<number, ObjectView>();

  for (const object of objects) {
    const id = isWaypoint(object) ? idOf(object) : undefined;

    if (id !== undefined && !found.has(id)) {
      found.set(id, object);
    }
  }
  return found;
};

export const waypointLabel = (object: ObjectView): string =>
  nameOf(object) || `#${idOf(object)}`;

export const ownerOf = (object: ObjectView): string => {
  const entry = object.properties.find(
    (candidate) => candidate.key === 'originalOwner',
  );

  return entry ? String(entry.value.value) : '';
};

export const parseValue = (
  type: DictValue['type'],
  text: string,
): DictValue | undefined => {
  if (type === 'bool') {
    if (['true', '1', 'yes'].includes(text.toLowerCase())) {
      return { type, value: true };
    }
    if (['false', '0', 'no'].includes(text.toLowerCase())) {
      return { type, value: false };
    }
    return undefined;
  }
  if (type === 'int' || type === 'real') {
    const number = Number(text);

    if (
      text.trim() === '' ||
      !Number.isFinite(number) ||
      (type === 'int' && !Number.isInteger(number))
    ) {
      return undefined;
    }
    return { type, value: number };
  }
  return { type, value: text };
};

export const insidePolygon = (
  [x, y]: [number, number],
  points: readonly [number, number][],
): boolean => {
  let inside = false;

  for (let at = 0, back = points.length - 1; at < points.length; back = at++) {
    const [ax, ay] = points[at];
    const [bx, by] = points[back];

    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
};

export interface CanvasSize {
  width: number;
  height: number;
}

export const projectToCanvas = (
  heights: HeightsView,
  size: CanvasSize,
  x: number,
  y: number,
): [number, number] => {
  const scale = size.width / heights.width;
  const cellX = x / 10 + heights.border;
  const cellY = y / 10 + heights.border;

  return [cellX * scale, size.height - cellY * scale];
};

export const unprojectFromCanvas = (
  heights: HeightsView,
  size: CanvasSize,
  px: number,
  py: number,
): [number, number] => {
  const scale = size.width / heights.width;

  return [
    (px / scale - heights.border) * 10,
    ((size.height - py) / scale - heights.border) * 10,
  ];
};

export interface Relief {
  pixels: Uint8ClampedArray;
  low: number;
  high: number;
}

export const shadeRelief = (heights: HeightsView): Relief => {
  const { width, height, samples } = heights;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let low = Infinity;
  let high = -Infinity;

  for (let at = 0; at < samples.length; at++) {
    const sample = samples[at];

    if (sample < low) {
      low = sample;
    }
    if (sample > high) {
      high = sample;
    }
  }
  const range = Math.max(1, high - low);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = samples[y * width + x];
      const west = samples[y * width + Math.max(0, x - 1)];
      const north = samples[Math.min(height - 1, y + 1) * width + x];
      const slope = (((here - west) + (here - north)) / range) * 6;
      const level = 70 + ((here - low) / range) * 150 + slope * 60;
      const value = Math.max(0, Math.min(255, level));
      const pixel = ((height - 1 - y) * width + x) * 4;

      pixels[pixel] = value * 0.85;
      pixels[pixel + 1] = value * 0.95;
      pixels[pixel + 2] = value * 0.75;
      pixels[pixel + 3] = 255;
    }
  }
  return { pixels, low, high };
};

export const turnedAngle = (angle: number, step: number): number => {
  let turned = angle + step;

  while (turned > Math.PI) {
    turned -= Math.PI * 2;
  }
  while (turned < -Math.PI) {
    turned += Math.PI * 2;
  }
  return turned;
};

export const filterObjects = (
  objects: readonly ObjectView[],
  filter: string,
): ObjectView[] => {
  const text = filter.toLowerCase();

  return objects.filter(
    (object) =>
      !text ||
      object.template.toLowerCase().includes(text) ||
      nameOf(object).toLowerCase().includes(text),
  );
};
