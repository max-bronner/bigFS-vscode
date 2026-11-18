export const formatCount = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? '' : 's'}`;
