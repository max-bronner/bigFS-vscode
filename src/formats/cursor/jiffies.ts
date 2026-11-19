export const JIFFIES_PER_SECOND = 60;

export const jiffiesToMilliseconds = (jiffies: number): number =>
  Math.round((jiffies * 1000) / JIFFIES_PER_SECOND);

export const millisecondsToJiffies = (milliseconds: number): number =>
  Math.max(1, Math.round((milliseconds * JIFFIES_PER_SECOND) / 1000));
