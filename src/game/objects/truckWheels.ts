export interface TruckWheels {
  draw: string;
  bones: string[];
  multiplier?: string;
}

interface Driven {
  wheels?: TruckWheels;
  speed?: string;
}

const TIRE_BONE = /^(mid)?(left|right)(front|rear|mid)tirebone2?$/;
const MAX_TIRE_BONES = 32;
const DEFAULT_SPEED = 30;
const MAX_TURN_RATE = 1000;

export const readWheelField = (
  wheels: TruckWheels | undefined,
  draw: string,
  key: string,
  value: string,
): TruckWheels | undefined => {
  const isBone = TIRE_BONE.test(key);

  if ((!isBone && key !== 'tirerotationmultiplier') || (wheels && wheels.draw !== draw)) {
    return undefined;
  }

  const next = wheels ?? { draw, bones: [] };

  if (!isBone) {
    next.multiplier = value;
  } else if (
    next.bones.length < MAX_TIRE_BONES &&
    !/^none$/i.test(value) &&
    !next.bones.some((bone) => bone.toLowerCase() === value.toLowerCase())
  ) {
    next.bones.push(value);
  }
  return next;
};

export const resolveWheelMacros = (
  scene: Driven,
  resolveMacro: (name: string) => string | undefined,
): void => {
  if (scene.speed !== undefined) {
    scene.speed = resolveMacro(scene.speed) ?? scene.speed;
  }
  if (scene.wheels?.multiplier !== undefined) {
    scene.wheels.multiplier = resolveMacro(scene.wheels.multiplier) ?? scene.wheels.multiplier;
  }
};

export const computeTurnRate = (scene: Driven, conditions: readonly string[]): number => {
  if (!scene.wheels?.bones.length || !conditions.includes('MOVING')) {
    return 0;
  }

  const speed = Number.parseFloat(scene.speed ?? '');
  const rate =
    Number.parseFloat(scene.wheels.multiplier ?? '0') *
    (Number.isFinite(speed) ? speed : DEFAULT_SPEED) *
    (conditions.includes('BACKING_UP') ? -1 : 1);

  return Number.isFinite(rate) ? Math.max(-MAX_TURN_RATE, Math.min(MAX_TURN_RATE, rate)) : 0;
};
