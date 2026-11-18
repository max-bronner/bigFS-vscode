export type MapMode =
  | { kind: 'place'; template: string; waypoint: boolean }
  | { kind: 'area' };

export const describeMode = (mode: MapMode | undefined): string =>
  !mode
    ? ''
    : mode.kind === 'place'
      ? `Click the map to place ${mode.template} · Esc cancels`
      : 'Click the map to add points · Enter finishes · Backspace removes the last · Esc cancels';

export const nextAreaName = (taken: ReadonlySet<string>): string => {
  let number = taken.size + 1;

  while (taken.has(`Area ${number}`)) {
    number++;
  }
  return `Area ${number}`;
};
