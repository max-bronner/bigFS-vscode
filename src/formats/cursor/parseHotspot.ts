export const parseHotspot = (
  text: string,
  width: number,
  height: number,
): { x: number; y: number } | string => {
  const match = /^\s*(\d+)\s*[,\s]\s*(\d+)\s*$/.exec(text);

  if (!match) {
    return 'Type the hotspot as x,y in pixels, for example 4,2';
  }

  const x = Number(match[1]);
  const y = Number(match[2]);

  return x < width && y < height
    ? { x, y }
    : `The hotspot must lie inside the ${width}×${height} image`;
};
