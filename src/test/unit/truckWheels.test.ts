import * as assert from 'assert';
import { poseAt } from '../../formats/w3d/w3dPose';
import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import { pickPlayingState } from '../../game/objects/drawStates';
import { computeTurnRate, resolveWheelMacros } from '../../game/objects/truckWheels';
import { toScene } from './objectFixtures';

const CART = [
  'Object TestCart',
  '  Draw = W3DTruckDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TC_SKN',
  '    End',
  '    IdleAnimationState',
  '      Animation = Idle',
  '        AnimationName = TC_SKL.TC_IDLA',
  '      End',
  '    End',
  '    LeftFrontTireBone = WHEEL_L01',
  '    LeftFrontTireBone2 = WHEEL_L02',
  '    TireRotationMultiplier = 0.25',
  '  End',
  '  LocomotorSet',
  '    Locomotor = TestLocomotor',
  '    Condition = SET_NORMAL',
  '    Speed = TEST_SPEED',
  '  End',
  '  LocomotorSet',
  '    Locomotor = TestLocomotor',
  '    Condition = SET_WANDER',
  '    Speed = 4',
  '  End',
  'End',
];

suite('Truck wheels', () => {
  const scene = toScene(CART);

  resolveWheelMacros(scene, (name) => (name === 'TEST_SPEED' ? '40' : undefined));

  test("both bones of an axle turn at the normal set's speed, backwards backing up", () => {
    assert.deepStrictEqual(scene.wheels?.bones, ['WHEEL_L01', 'WHEEL_L02']);
    assert.strictEqual(computeTurnRate(scene, ['MOVING']), 10);
    assert.strictEqual(computeTurnRate(scene, ['MOVING', 'BACKING_UP']), -10);
    assert.strictEqual(computeTurnRate(scene, []), 0);
  });

  test('a truck without states of moving is offered them, and no rule matches them', () => {
    const implied = scene.states.filter((state) => state.isImplied);

    assert.deepStrictEqual(
      implied.map((state) => [state.label, state.animations]),
      [
        ['AnimationState = MOVING', ['TC_SKL.TC_IDLA']],
        ['AnimationState = MOVING BACKING_UP', ['TC_SKL.TC_IDLA']],
      ],
    );
    assert.ok(!pickPlayingState(scene, 'ModuleTag_Body', ['MOVING'])?.isImplied);
  });

  test('a turn is about the bone’s own Y and carries what is below it', () => {
    const skeleton = {
      name: 'TC_SKL',
      names: ['ROOTTRANSFORM', 'WHEEL_L01', 'HUB'],
      parents: [-1, 0, 1],
      translations: [0, 0, 0, 5, 0, 0, 1, 0, 0],
      rotations: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    } as unknown as SceneSkeleton;
    const { world } = poseAt(skeleton, undefined, 0, new Map([[1, Math.PI / 2]]));
    const rounded = (values: readonly number[]) => values.map((value) => Math.round(value) + 0);

    assert.deepStrictEqual(rounded(world[1].t), [5, 0, 0]);
    assert.deepStrictEqual(rounded(world[2].t), [5, 0, -1]);
  });
});
