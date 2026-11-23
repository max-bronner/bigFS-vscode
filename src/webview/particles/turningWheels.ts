import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import type { ObjectScene } from '../../game/objects/objectScene';
import { computeTurnRate } from '../../game/objects/truckWheels';
import { viewer } from './page';

const wheels = {
  bones: new Set<string>(),
  rate: 0,
  angle: 0,
  time: 0,
};

export const setMovement = (
  scene: ObjectScene,
  draw: string | undefined,
  conditions: readonly string[],
): void => {
  const own = scene.wheels?.draw === draw ? scene.wheels : undefined;

  wheels.bones = new Set(own?.bones.map((bone) => bone.toLowerCase()));
  wheels.rate = own ? computeTurnRate(scene, conditions) : 0;
  if (!wheels.rate) {
    wheels.angle = 0;
  }
};

const getTurns = (skeleton: SceneSkeleton, time: number) => {
  const passed = time >= wheels.time ? time - wheels.time : time;

  wheels.time = time;
  if (!wheels.rate) {
    return undefined;
  }
  wheels.angle = (wheels.angle + wheels.rate * passed) % (2 * Math.PI);

  const turns = new Map<number, number>();

  skeleton.names.forEach((name, bone) => {
    if (wheels.bones.has(name.toLowerCase())) {
      turns.set(bone, wheels.angle);
    }
  });
  return turns;
};

viewer.setBoneTurns(getTurns);
