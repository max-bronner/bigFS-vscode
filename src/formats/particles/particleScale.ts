import type { NumericField } from './particleIni';

type Rule = { space: number; time: number; damping?: true };

const RULES: Record<string, Rule> = {
  size: { space: 1, time: 0 },
  radius: { space: 1, time: 0 },
  length: { space: 1, time: 0 },
  halfsize: { space: 1, time: 0 },
  startpoint: { space: 1, time: 0 },
  endpoint: { space: 1, time: 0 },
  offset: { space: 1, time: 0 },
  slaveposoffset: { space: 1, time: 0 },
  height: { space: 1, time: 0 },
  volsphereradius: { space: 1, time: 0 },
  volcylinderradius: { space: 1, time: 0 },
  volcylinderlength: { space: 1, time: 0 },
  volboxhalfsize: { space: 1, time: 0 },
  vollinestart: { space: 1, time: 0 },
  vollineend: { space: 1, time: 0 },
  sizerate: { space: 1, time: -1 },
  startsizerate: { space: 1, time: -1 },
  x: { space: 1, time: -1 },
  y: { space: 1, time: -1 },
  z: { space: 1, time: -1 },
  speed: { space: 1, time: -1 },
  otherspeed: { space: 1, time: -1 },
  radial: { space: 1, time: -1 },
  normal: { space: 1, time: -1 },
  driftvelocity: { space: 1, time: -1 },
  velorthox: { space: 1, time: -1 },
  velorthoy: { space: 1, time: -1 },
  velorthoz: { space: 1, time: -1 },
  velspherical: { space: 1, time: -1 },
  velhemispherical: { space: 1, time: -1 },
  velcylindricalradial: { space: 1, time: -1 },
  velcylindricalnormal: { space: 1, time: -1 },
  veloutward: { space: 1, time: -1 },
  veloutwardother: { space: 1, time: -1 },
  angularratez: { space: 0, time: -1 },
  angularratexy: { space: 0, time: -1 },
  gravity: { space: 1, time: -2 },
  lifetime: { space: 0, time: 1 },
  systemlifetime: { space: 0, time: 1 },
  burstdelay: { space: 0, time: 1 },
  initialdelay: { space: 0, time: 1 },
  velocitydamping: { space: 0, time: 0, damping: true },
  sizeratedamping: { space: 0, time: 0, damping: true },
  angulardamping: { space: 0, time: 0, damping: true },
  angulardampingxy: { space: 0, time: 0, damping: true },
};

const ruleOf = (field: NumericField): Rule | undefined => {
  const key = field.keyword.toLowerCase();

  if (/^(color|alpha)[1-8]$/.test(key)) {
    return field.part === 'frame' ? { space: 0, time: 1 } : undefined;
  }
  return RULES[key];
};

export const scaleEffect = (
  fields: NumericField[],
  values: ReadonlyMap<string, number>,
  space: number,
  time: number,
): Map<string, number> => {
  const scaled = new Map<string, number>();

  if (!(space > 0) || !(time > 0)) {
    throw new Error('Scale by a factor above 0');
  }
  for (const field of fields) {
    const rule = ruleOf(field);
    const value = values.get(field.id) ?? field.value;

    if (!rule) {
      continue;
    }

    let next = rule.damping
      ? Math.sign(value) * Math.abs(value) ** (1 / time)
      : value * space ** rule.space * time ** rule.time;

    if (field.integer) {
      next = Math.round(next);
    }
    if (next !== value) {
      scaled.set(field.id, Number(next.toFixed(4)));
    }
  }
  return scaled;
};
