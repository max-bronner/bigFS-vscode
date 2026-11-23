import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import {
  describeUpgrade,
  listAppearanceControls,
  removeObjectPrefix,
  switchUpgrade,
} from '../../game/objects/appearanceControls';
import { readLevelTables } from '../../game/objects/creationUpgrades';
import { listAppearanceOptions } from '../../game/objects/objectAppearance';
import { readUpgradeNeeds } from '../../game/objects/upgradeNeeds';
import { loadSageIniSchema } from './loadSageIniSchema';
import { toScene } from './objectFixtures';

const schema = loadSageIniSchema();

const showsUpgrade = (name: string, shows: string, more: string[] = []) => [
  `  Behavior = SubObjectsUpgrade ModuleTag_${name}`,
  `    TriggeredBy = Upgrade_${name}`,
  ...more,
  `    ShowSubObjects = ${shows}`,
  '  End',
];

const modelState = (conditions: string, model: string) => [
  `    ModelConditionState = ${conditions}`,
  `      Model = ${model}`,
  '    End',
];

const KEEP = [
  'Object TestKeep',
  '  CommandSet = TestKeepCommandSet',
  '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TK_SKN',
  '    End',
  ...modelState('DAMAGED', 'TK_D1'),
  ...modelState('RUBBLE', 'TK_D3'),
  ...modelState('DOOR_1_OPENING', 'TK_DOOR'),
  ...modelState('ACTIVELY_BEING_CONSTRUCTED PARTIALLY_CONSTRUCTED', 'TK_A'),
  ...modelState('USER_3', 'TK_GOLD'),
  ...modelState('USER_5', 'TK_SKN'),
  ...modelState('WORLD_BUILDER', 'TK_MARK'),
  '  End',
  ...showsUpgrade('KeepLevel2', 'V1', ['    ConflictsWith = Upgrade_KeepLevel3']),
  ...showsUpgrade('KeepLevel3', 'V2'),
  ...showsUpgrade('KeepWalls', 'WALLS'),
  ...showsUpgrade('KeepNest', 'NEST'),
  '  Behavior = SubObjectsUpgrade ModuleTag_Spire',
  '    TriggeredBy = Upgrade_KeepSpire Upgrade_KeepWalls',
  '    RequiresAllTriggers = Yes',
  '    ShowSubObjects = SPIRE',
  '  End',
  'End',
];

const level = (rank: number, upgrade: string) => [
  `ExperienceLevel TestKeepLevel${rank}`,
  '  TargetNames = TestKeep',
  `  RequiredExperience = ${rank}`,
  `  Rank = ${rank}`,
  `  Upgrades = ${upgrade}`,
  'End',
];

const read = (hasTable = true) => {
  const scene = toScene(KEEP);

  if (hasTable) {
    const lines = [
      ...level(3, 'Upgrade_KeepLevel3'),
      ...level(1, 'Upgrade_StructureLevel1'),
      ...level(2, 'Upgrade_KeepLevel2'),
    ];

    scene.levels = readLevelTables([parseSageIni(lines, schema)]).get('testkeep');
    scene.heldUpgrades = scene.levels![0].upgrades;
  }
  return scene;
};

const getControls = (scene = read()) =>
  listAppearanceControls(scene, listAppearanceOptions([scene]));

suite('Appearance controls', () => {
  test('levels are one or another, each holding the lower ones', () => {
    assert.deepStrictEqual(
      getControls().levels.map(({ title, upgrades }) => [title, upgrades]),
      [
        ['Level 1', []],
        ['Level 2', ['Upgrade_KeepLevel2']],
        ['Level 3', ['Upgrade_KeepLevel2', 'Upgrade_KeepLevel3']],
      ],
    );
    assert.ok(!getControls().upgrades.some((each) => /level/i.test(each.name)));
  });

  test('numbered upgrades are levels without a table, too', () => {
    assert.deepStrictEqual(
      getControls(read(false)).levels.map(({ title, upgrades }) => [title, upgrades.length]),
      [['Level 1', 0], ['Level 2', 1], ['Level 3', 2]],
    );
  });

  test('a numbered level past the end of the table follows it', () => {
    const scene = read();

    scene.levels = scene.levels!.slice(0, 2);
    assert.deepStrictEqual(
      getControls(scene).levels.map(({ title, upgrades }) => [title, upgrades.length]),
      [['Level 1', 0], ['Level 2', 1], ['Level 3', 2]],
    );
  });

  test('damage and construction are one or another, and what is played is no appearance', () => {
    const { damage, construction, forms } = getControls();

    assert.deepStrictEqual(damage.map((each) => each.title), ['Intact', 'Damaged', 'Rubble']);
    assert.deepStrictEqual(construction.map((each) => each.conditions), [
      [],
      ['ACTIVELY_BEING_CONSTRUCTED', 'PARTIALLY_CONSTRUCTED'],
    ]);
    assert.deepStrictEqual(forms.map((each) => each.conditions), [['USER_3']]);
    assert.strictEqual(forms[0].isIniName, true);
  });

  test('an upgrade switches by itself, whatever it needs', () => {
    const scene = read();

    scene.upgradeNeeds = { upgrade_keepnest: ['Upgrade_KeepSpire'] };

    const { upgrades } = getControls(scene);
    const on = switchUpgrade(upgrades, [], 'Upgrade_KeepNest', true);

    assert.deepStrictEqual(on, ['Upgrade_KeepNest']);

    const both = switchUpgrade(upgrades, on, 'Upgrade_KeepWalls', true);

    assert.deepStrictEqual(both, ['Upgrade_KeepNest', 'Upgrade_KeepWalls']);
    assert.deepStrictEqual(switchUpgrade(upgrades, both, 'Upgrade_KeepWalls', false), on);
  });

  test('upgrades that rule each other out switch over', () => {
    const toggle = (name: string, other: string) => ({
      name,
      title: name,
      fullTitle: name,
      isHeld: false,
      needs: [],
      excludes: [other],
    });

    assert.deepStrictEqual(switchUpgrade([toggle('A', 'B'), toggle('B', 'A')], ['A'], 'B', true), ['B']);
  });

  test("a button's NeededUpgrade is a need, unless any one of several is enough", async () => {
    const blocks: Record<string, string[]> = {
      Set: ['CommandSet Set', '  1 = Nest', '  2 = Either', 'End', '  3 = Stray'],
      Nest: ['CommandButton Nest', '  Upgrade = Upgrade_Nest', '  NeededUpgrade = Upgrade_Vines ; first', 'End'],
      Either: ['CommandButton Either', '  Upgrade = Upgrade_Either', '  NeededUpgrade = A B', '  NeededUpgradeAny = Yes', 'End'],
    };

    assert.deepStrictEqual(await readUpgradeNeeds(['Set'], async (_, name) => blocks[name]), {
      upgrade_nest: ['Upgrade_Vines'],
    });
  });

  test("an upgrade's whole words that start the object's name are left out, unless nothing is left", () => {
    assert.strictEqual(removeObjectPrefix('Test fortress ice walls', 'TestFortressCitadel'), 'Ice walls');
    assert.strictEqual(removeObjectPrefix('Test heavy armor', 'Test_Soldier'), 'Heavy armor');
    assert.strictEqual(removeObjectPrefix('Forged blades', 'TestSoldier'), 'Forged blades');
    assert.strictEqual(removeObjectPrefix('Test fortress', 'TestFortress'), 'Test fortress');
    assert.strictEqual(removeObjectPrefix('Testing grounds', 'TestFortress'), 'Testing grounds');
  });

  test('the upgrades offered are named in words without the object, by their whole name on hover', () => {
    assert.strictEqual(describeUpgrade('Upgrade_GondorHeavyArmor'), 'Gondor heavy armor');

    const scene = toScene(['Object TestFortress', ...showsUpgrade('TestFortressIceWalls', 'WALLS'), 'End']);
    const [upgrade] = listAppearanceControls(scene, listAppearanceOptions([scene])).upgrades;

    assert.deepStrictEqual([upgrade.title, upgrade.fullTitle], ['Ice walls', 'Test fortress ice walls']);
  });

  test('a variation no plot builds is offered after the plot\'s, with a note', () => {
    const scene = toScene([
      'Object TestTower',
      '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
      '    DefaultModelConditionState',
      '      Model = TT_PLOT',
      '    End',
      ...modelState('BUILD_VARIATION_ONE', 'TT_SIDE'),
      ...modelState('BUILD_VARIATION_TWO', 'TT_CORNER'),
      '  End',
      'End',
    ]);

    scene.padVariation = 'BUILD_VARIATION_TWO';
    assert.deepStrictEqual(
      getControls(scene).variations.map(({ title, note }) => [title, note]),
      [
        ['Variation 2, from its building plot', undefined],
        ['As placed', undefined],
        ['Variation 1', 'no plot builds it so'],
      ],
    );
  });
});
