import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { composeObject } from '../../game/objects/objectComposition';
import type { ComposableObject } from '../../game/objects/objectComposition';
import { readObjectScene } from '../../game/objects/objectScene';
import { getPlacedBonePoint } from '../../game/objects/placeComposedParts';
import { loadSageIniSchema } from './loadSageIniSchema';

const schema = loadSageIniSchema();

const toObject = (lines: string[]): ComposableObject => {
  const parsed = parseSageIni(lines, schema);
  const scene = readObjectScene(parsed, schema, () => true, () => true, lines)!;

  return { name: scene.name, parsed, scene };
};

const TOWER = toObject([
  'Object TestTower',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TT_SKN',
  '    End',
  '  End',
  '  Behavior = ObjectCreationUpgrade ModuleTag_Engine',
  '    TriggeredBy = Upgrade_HasEngine',
  '    ThingToSpawn = TestEngine',
  '    Offset = X:12 Y:0 Z:50',
  '  End',
  'End',
]);
const ENGINE = toObject([
  'Object TestEngine',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TE_SKN',
  '    End',
  '    ModelConditionState = USER_2',
  '      Model = TE_SKN',
  '      ParticleSysBone = PROJECTILE01 TestBurningShot FollowBone:Yes',
  '    End',
  '  End',
  '  Behavior = WeaponSetUpgrade ModuleTag_FlamingShot',
  '    TriggeredBy = Upgrade_FlamingShot',
  '    CustomAnimAndDuration = AnimState:USER_2 AnimTime:0',
  '  End',
  'End',
]);

const compose = (upgrades: string[]) =>
  composeObject(
    TOWER,
    { readObject: async (name) => (name === 'TestEngine' ? ENGINE : undefined), resolveMacro: () => undefined },
    [],
    { upgrades },
  );

suite('Part effects', () => {
  test("a spawned part plays its state's systems once an upgrade of its owner selects that state", async () => {
    const before = (await compose(['Upgrade_HasEngine'])).parts.find((part) => part.object === 'TestEngine');
    const after = (await compose(['Upgrade_HasEngine', 'Upgrade_FlamingShot'])).parts.find(
      (part) => part.object === 'TestEngine',
    );

    assert.deepStrictEqual(before?.effects ?? [], []);
    assert.deepStrictEqual(
      after?.effects?.map(({ kind, name, bone }) => [kind, name, bone]),
      [['system', 'TestBurningShot', 'PROJECTILE01']],
    );
  });

  test("a part's bone is found where the part stands, and a missing bone at its origin", () => {
    const skeleton = {
      name: 'TE_SKL',
      names: ['ROOTTRANSFORM', 'PROJECTILE01'],
      parents: [-1, 0],
      translations: [0, 0, 0, 1, 2, 3],
      rotations: [0, 0, 0, 1, 0, 0, 0, 1],
    };
    const placed = { matrix: [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  12, 0, 50, 1], skeleton: skeleton as never };

    assert.deepStrictEqual(getPlacedBonePoint(placed, 'projectile01'), [13, 2, 53]);
    assert.deepStrictEqual(getPlacedBonePoint(placed, 'NOSUCHBONE'), [12, 0, 50]);
  });
});
