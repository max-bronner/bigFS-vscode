import * as assert from 'assert';
import { composeObject } from '../../game/objects/objectComposition';
import { readObjectCreationList } from '../../game/objects/objectCreationList';
import { toObject } from './objectFixtures';

const LIST = [
  'ObjectCreationList OCL_TestTurret',
  '  CreateObject',
  '    ObjectNames = TestTurret ; the one on the wall',
  '    Offset = X:0.0 Y:-2 Z:52.0',
  '    Count = 1',
  '    Disposition = LIKE_EXISTING',
  '  End',
  '  CreateDebris',
  '    ModelNames = TD_CHUNK',
  '  End',
  '  CreateObject',
  '    ObjectNames = TestFlag TestBanner',
  '    Offset = X: 4 Y:0 Z:10',
  '    RequiredUpgrades = Upgrade_Flags',
  '    ForbiddenUpgrades = Upgrade_Ruin',
  '  End',
  'End',
  'ObjectCreationList OCL_Other',
  '  CreateObject',
  '    ObjectNames = Never',
  '  End',
  'End',
];

const WALL = [
  'Object TestWall',
  '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TW_SKN',
  '    End',
  '  End',
  '  Behavior = OCLUpdate ModuleTag_MakeTurret',
  '    OCL = OCL_TestTurret',
  '    MinDelay = 1500',
  '    MaxDelay = 1500',
  '    Amount = 1',
  '  End',
  'End',
];

const MODEL = (name: string) => [
  `Object ${name}`,
  '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  `      Model = ${name}_SKN`,
  '    End',
  '  End',
  'End',
];

suite('Object creation lists', () => {
  test('the CreateObject nuggets of a list are read for what stands where, up to its End', () => {
    assert.deepStrictEqual(readObjectCreationList(LIST), [
      { names: ['TestTurret'], offset: [0, -2, 52], count: 1, requiredUpgrades: [], forbiddenUpgrades: [] },
      {
        names: ['TestFlag', 'TestBanner'],
        offset: [4, 0, 10],
        count: 1,
        requiredUpgrades: ['Upgrade_Flags'],
        forbiddenUpgrades: ['Upgrade_Ruin'],
      },
    ]);
  });

  test("an OCLUpdate's objects stand on the built object, those an upgrade gates once it is given", async () => {
    const sources = {
      readObject: async (name: string) =>
        ['TestTurret', 'TestFlag'].includes(name) ? toObject(MODEL(name)) : undefined,
      readCreationList: async (name: string) => (name === 'OCL_TestTurret' ? LIST : undefined),
    };
    const listed = async (upgrades: string[]) =>
      (await composeObject(toObject(WALL), sources, [], { upgrades })).parts
        .filter((part) => part.source.moduleType === 'OCLUpdate')
        .map((part) => ({
          object: part.object,
          isShown: part.isShown,
          role: part.binding?.role,
          placement: part.placement,
        }));

    assert.deepStrictEqual(await listed([]), [
      { object: 'TestTurret', isShown: true, role: 'always', placement: { kind: 'offset', x: 0, y: -2, z: 52 } },
      { object: 'TestFlag', isShown: false, role: 'upgrade', placement: { kind: 'offset', x: 4, y: 0, z: 10 } },
    ]);
    assert.deepStrictEqual(
      (await listed(['Upgrade_Flags'])).map((part) => part.isShown),
      [true, true],
    );
    assert.deepStrictEqual(
      (await listed(['Upgrade_Flags', 'Upgrade_Ruin'])).map((part) => part.isShown),
      [true, false],
    );
  });
});
