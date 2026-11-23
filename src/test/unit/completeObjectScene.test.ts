import * as assert from 'assert';
import { completeObjectScene } from '../../game/objects/completeObjectScene';
import type { SceneContext } from '../../game/objects/completeObjectScene';
import { toScene } from './objectFixtures';

const TOWER = [
  'Object TestTower',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TT_SKN',
  '    End',
  '  End',
  '  CommandSet = TestTowerCommandSet',
  'End',
];

const DEFINITIONS: Record<string, string[]> = {
  'CommandSet/TestTowerCommandSet': ['CommandSet TestTowerCommandSet', '  1 = Command_TestSpire', 'End'],
  'CommandButton/Command_TestSpire': [
    'CommandButton Command_TestSpire',
    '  Command = OBJECT_UPGRADE',
    '  Upgrade = Upgrade_Spire',
    '  NeededUpgrade = Upgrade_Stone',
    'End',
  ],
};

const CONTEXT: SceneContext = {
  levelTables: new Map([['testtower', [{ required: 0, rank: 1, upgrades: ['Upgrade_Level1'] }]]]),
  sun: [1, 0, 0],
  resolveMacro: () => undefined,
};

suite('Object scene completion', () => {
  test('every scene gets its levels and the upgrades the first gives; only the previewed one its buttons', async () => {
    const previewed = {
      findDefinitionLines: async (keyword: string, name: string) => DEFINITIONS[`${keyword}/${name}`],
      padLookup: { findUsers: async () => [], findObjectLines: async () => undefined },
    };
    const part = toScene(TOWER);
    const shown = toScene(TOWER);

    await completeObjectScene(part, CONTEXT);
    await completeObjectScene(shown, CONTEXT, previewed);

    assert.deepStrictEqual(part.heldUpgrades, ['Upgrade_Level1']);
    assert.deepStrictEqual(part.sun, [1, 0, 0]);
    assert.strictEqual(part.upgradeNeeds, undefined);
    assert.deepStrictEqual(shown.upgradeNeeds, { upgrade_spire: ['Upgrade_Stone'] });
    assert.strictEqual(shown.padVariation, undefined);
  });

  test("a failure reading the previewed object's buttons or plots leaves them out", async () => {
    const scene = toScene(TOWER);
    const fail = async (): Promise<never> => {
      throw new Error('unreadable');
    };

    await completeObjectScene(scene, CONTEXT, {
      findDefinitionLines: fail,
      padLookup: { findUsers: fail, findObjectLines: fail },
    });
    assert.deepStrictEqual(scene.upgradeNeeds, {});
    assert.strictEqual(scene.padVariation, undefined);
    assert.deepStrictEqual(scene.heldUpgrades, ['Upgrade_Level1']);
  });
});
