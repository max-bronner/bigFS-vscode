import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { readLevelTables } from '../../game/objects/creationUpgrades';
import { loadSageIniSchema } from './loadSageIniSchema';

const schema = loadSageIniSchema();

const LEVELS = [
  'ExperienceLevel TestBeastLevel2',
  '  TargetNames = TestBeast TestBeastVariant',
  '  RequiredExperience = 100',
  '  Rank = 2',
  '  Upgrades = Upgrade_TestBeastLevel2',
  'End',
  'ExperienceLevel TestBeastLevel1',
  '  TargetNames = TestBeast TestBeastVariant',
  '  RequiredExperience = TEST_FIRST_LEVEL',
  '  Rank = 1',
  '  Upgrades = Upgrade_TestBeastLevel1',
  '  SelectionDecal',
  '    Texture = test_decal',
  '  End',
  'End',
  'ExperienceLevel TestSoldierLevel1',
  '  TargetNames = TestSoldier',
  '  RequiredExperience = 0',
  '  Rank = 1',
  'End',
];

suite('Creation upgrades', () => {
  test('a new object holds the upgrades of its lowest level, whatever order the levels are written in', () => {
    const tables = readLevelTables([parseSageIni(LEVELS, schema)], (name) =>
      name === 'TEST_FIRST_LEVEL' ? '1' : undefined,
    );

    assert.deepStrictEqual(
      [...tables].map(([name, [first]]) => [name, first.upgrades]),
      [
        ['testbeast', ['Upgrade_TestBeastLevel1']],
        ['testbeastvariant', ['Upgrade_TestBeastLevel1']],
        ['testsoldier', []],
      ],
    );
  });

  test('levels of equal experience are ordered by rank', () => {
    const lines = LEVELS.map((line) => line.replace('= 100', '= 1').replace('TEST_FIRST_LEVEL', '1'))
      .map((line) => line.replace('Rank = 2', 'Rank = 0'));

    assert.deepStrictEqual(readLevelTables([parseSageIni(lines, schema)]).get('testbeast')?.[0].upgrades, [
      'Upgrade_TestBeastLevel2',
    ]);
  });
});
