import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { listObjectAbilities } from '../../game/objects/objectAbilities';
import type { AbilityDefinitionKind, AbilitySources } from '../../game/objects/objectAbilities';
import { readObjectScene } from '../../game/objects/objectScene';
import { loadSageIniSchema } from './loadSageIniSchema';

const schema = loadSageIniSchema();

const WIZARD = [
  'Object TestWizard',
  '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TW_SKN',
  '    End',
  '    ModelConditionState = UPGRADE_STONE',
  '      Model = TW_STONE',
  '      ParticleSysBone = B_TOP TestStoneGlow',
  '    End',
  '    IdleAnimationState',
  '      Animation',
  '        AnimationName = TW.Idle',
  '      End',
  '    End',
  '    AnimationState = SPECIAL_WEAPON_ONE',
  '      Animation',
  '        AnimationName = TW.Cast',
  '      End',
  '      FXEvent = Frame:15 Name:FX_TestCharge',
  '    End',
  '  End',
  '  CommandSet = TestWizardSet',
  '  WeaponSet',
  '    Conditions = None',
  '    Weapon = PRIMARY TestBow',
  '  End',
  '  Behavior = SpecialPowerModule ModuleTag_BlastStarter',
  '    SpecialPowerTemplate = SpecialTestBlast',
  '    InitiateSound = TestBlastVoice',
  '    TriggerFX = FX_TestTrigger',
  '  End',
  '  Behavior = WeaponFireSpecialAbilityUpdate ModuleTag_BlastFire',
  '    SpecialPowerTemplate = SpecialTestBlast',
  '    WhichSpecialWeapon = 1',
  '    UnpackTime = 1000',
  '    SpecialWeapon = TestBlastWeapon',
  '  End',
  '  Behavior = SpecialPowerModule ModuleTag_Hidden',
  '    SpecialPowerTemplate = SpecialTestHidden',
  '    TriggerFX = FX_TestHidden',
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_Stone',
  '    TriggeredBy = Upgrade_TestStone',
  '    AddConditionFlags = UPGRADE_STONE',
  '  End',
  '  Behavior = SlowDeathBehavior ModuleTag_Death',
  '    DeathTypes = ALL',
  '    FX = INITIAL FX_TestDeath',
  '    OCL = FINAL OCL_TestRubble',
  '  End',
  '  Behavior = AIUpdateInterface ModuleTag_AI',
  '  End',
  'End',
];

const ARROW = [
  'Object TestArrow',
  '  Draw = W3DModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TA_SKN',
  '      ParticleSysBone = NONE TestArrowTrail',
  '    End',
  '  End',
  '  Behavior = FXListDie ModuleTag_Die',
  '    DeathFX = FX_TestArrowBreak',
  '  End',
  'End',
];

const RUBBLE = [
  'Object TestRubble',
  '  Draw = W3DModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TR_SKN',
  '      ParticleSysBone = NONE TestDust',
  '    End',
  '  End',
  '  Behavior = FXListDie ModuleTag_Die',
  '    DeathFX = FX_TestNever',
  '  End',
  'End',
];

const DEFINITIONS: Record<string, string[]> = {
  'CommandSet/TestWizardSet': [
    'CommandSet TestWizardSet',
    '  1 = Command_TestBlast',
    '  2 = Command_TestStone',
    '  3 = Command_TestFireBow',
    'End',
  ],
  'CommandButton/Command_TestBlast': [
    'CommandButton Command_TestBlast',
    '  Command = SPECIAL_POWER',
    '  SpecialPower = SpecialTestBlast',
    '  Options = NEED_TARGET_POS',
    '  TextLabel = CONTROLBAR:TestBlast',
    '  DescriptLabel = CONTROLBAR:ToolTipTestBlast',
    'End',
  ],
  'CommandButton/Command_TestStone': [
    'CommandButton Command_TestStone',
    '  Command = OBJECT_UPGRADE',
    '  Upgrade = Upgrade_TestStone',
    'End',
  ],
  'CommandButton/Command_TestFireBow': [
    'CommandButton Command_TestFireBow',
    '  Command = FIRE_WEAPON',
    '  WeaponSlot = PRIMARY',
    'End',
  ],
  'Weapon/TestBlastWeapon': [
    'Weapon TestBlastWeapon',
    '  PreAttackDelay = 500',
    '  PreAttackFX = FX_TestWindUp',
    '  FireFX = FX_TestBlast',
    '  DamageNugget',
    '    Damage = 100',
    '  End',
    'End',
  ],
  'Weapon/TestBow': [
    'Weapon TestBow',
    '  WeaponSpeed = 200',
    '  FireFX = FX_TestBowFire',
    '  ProjectileNugget',
    '    ProjectileTemplateName = TestArrow',
    '    WarheadTemplateName = TestArrowWarhead',
    '  End',
    'End',
    'Weapon TestNotThisOne',
    '  FireFX = FX_TestNever',
    'End',
  ],
  'Weapon/TestArrowWarhead': ['Weapon TestArrowWarhead', '  FireFX = FX_TestArrowHit', 'End'],
  'ObjectCreationList/OCL_TestRubble': [
    'ObjectCreationList OCL_TestRubble',
    '  CreateObject',
    '    ObjectNames = TestRubble',
    '  End',
    'End',
  ],
};

const DEFINED: Record<AbilityDefinitionKind, string[]> = {
  FXList: [
    'FX_TestCharge',
    'FX_TestTrigger',
    'FX_TestHidden',
    'FX_TestDeath',
    'FX_TestWindUp',
    'FX_TestBlast',
    'FX_TestBowFire',
    'FX_TestArrowHit',
    'FX_TestNever',
    'FX_TestArrowBreak',
  ],
  ParticleSystem: ['TestStoneGlow', 'TestArrowTrail', 'TestDust'],
  ObjectCreationList: ['OCL_TestRubble'],
  Weapon: ['TestBlastWeapon', 'TestBow', 'TestArrowWarhead'],
  ModifierList: [],
  Object: ['TestArrow', 'TestRubble'],
};

const isDefined = (kind: AbilityDefinitionKind, name: string) =>
  DEFINED[kind].some((each) => each.toLowerCase() === name.toLowerCase());

const readScene = (lines: string[]) =>
  readObjectScene(
    parseSageIni(lines, schema),
    schema,
    (name) => isDefined('FXList', name),
    (name) => isDefined('ParticleSystem', name),
    lines,
  );

const SOURCES: AbilitySources = {
  findDefinitionLines: async (keyword, name) => DEFINITIONS[`${keyword}/${name}`],
  isDefined,
  readObject: async (name) => ({ testarrow: readScene(ARROW), testrubble: readScene(RUBBLE) })[name.toLowerCase()],
  findText: (label) => ({ 'CONTROLBAR:TestBlast': '&Test Blast', 'CONTROLBAR:ToolTipTestBlast': 'Blasts.' })[label],
};

const listWizard = (sources = SOURCES) => {
  const parsed = parseSageIni(WIZARD, schema);

  return listObjectAbilities(parsed, readScene(WIZARD)!, schema, sources);
};

suite('Object abilities', () => {
  test('groups what an object plays by what sets it off', async () => {
    const groups = await listWizard();

    assert.deepStrictEqual(
      groups.map(({ title, abilities }) => [title, abilities.map((each) => each.name)]),
      [
        ['Abilities', ['Command_TestBlast', 'Command_TestFireBow', 'SpecialTestHidden']],
        ['Upgrades bought here', ['Command_TestStone']],
        ['Weapons', ['TestBow']],
        ['When it dies', ['ModuleTag_Death']],
      ],
    );
  });

  test('a power button follows its modules to its pose, its weapon and what it plays at the target', async () => {
    const [abilities] = await listWizard();
    const blast = abilities.abilities[0];

    assert.strictEqual(blast.title, 'Test Blast');
    assert.strictEqual(blast.description, 'Blasts.');
    assert.match(blast.trigger, /aimed at a target/);
    assert.deepStrictEqual(blast.sounds, ['TestBlastVoice']);
    assert.deepStrictEqual(
      blast.effects.map(({ name, place, delay }) => [name, place, delay]),
      [
        ['FX_TestTrigger', 'target', undefined],
        ['FX_TestBlast', 'self', 1],
        ['FX_TestCharge', 'self', 0.5],
      ],
    );
    assert.strictEqual(blast.effects[2].phase, 0);
    assert.deepStrictEqual(blast.phases, [{ conditions: ['SPECIAL_WEAPON_ONE', 'UNPACKING'], start: 0, length: 1 }]);
  });

  test('a weapon plays as it fires, its projectile in flight, and its warhead where it lands', async () => {
    const groups = await listWizard();
    const bow = groups.find((group) => group.title === 'Weapons')!.abilities[0];

    assert.deepStrictEqual(
      bow.effects.map(({ name, place, delay }) => [name, place, delay]),
      [
        ['FX_TestBowFire', 'self', undefined],
        ['TestArrowTrail', 'flight', undefined],
        ['FX_TestArrowBreak', 'target', 0.5],
        ['FX_TestArrowHit', 'target', 0.5],
      ],
    );
    assert.deepStrictEqual(bow.creates, ['TestArrow']);
    assert.match(bow.trigger, /primary weapon, by default/);
  });

  test('an upgrade button lists the states its upgrade raises, and a death its phases and what it leaves', async () => {
    const groups = await listWizard();
    const stone = groups.find((group) => group.title === 'Upgrades bought here')!.abilities[0];
    const death = groups.find((group) => group.title === 'When it dies')!.abilities[0];

    assert.deepStrictEqual(
      stone.effects.map(({ name, bone }) => [name, bone]),
      [['TestStoneGlow', 'B_TOP']],
    );
    assert.deepStrictEqual(
      death.effects.map(({ name, source }) => [name, source]),
      [
        ['FX_TestDeath', 'FX initial'],
        ['TestDust', 'on the origin, in TestRubble\'s DefaultModelConditionState'],
      ],
    );
    assert.deepStrictEqual(death.creates, ['TestRubble']);
  });

  test('a definition that cannot be read leaves its entry empty instead of failing', async () => {
    const groups = await listWizard({
      ...SOURCES,
      findDefinitionLines: async (keyword, name) =>
        keyword === 'Weapon' ? Promise.reject(new Error('unreadable')) : DEFINITIONS[`${keyword}/${name}`],
      readObject: async () => undefined,
    });
    const bow = groups.find((group) => group.title === 'Weapons')!.abilities[0];

    assert.deepStrictEqual(bow.effects, []);
  });

  test('a weapon that names itself as its warhead is followed once', async () => {
    const groups = await listWizard({
      ...SOURCES,
      findDefinitionLines: async (keyword, name) =>
        `${keyword}/${name}` === 'Weapon/TestBow'
          ? ['Weapon TestBow', '  FireFX = FX_TestBowFire', '  WarheadTemplateName = TestBow', 'End']
          : DEFINITIONS[`${keyword}/${name}`],
    });
    const bow = groups.find((group) => group.title === 'Weapons')!.abilities[0];

    assert.deepStrictEqual(
      bow.effects.map(({ name, place }) => [name, place]),
      [
        ['FX_TestBowFire', 'self'],
        ['FX_TestBowFire', 'target'],
      ],
    );
  });

  test('an attack winds up before it fires, and a weapon a module fires does not', async () => {
    const groups = await listWizard({
      ...SOURCES,
      findDefinitionLines: async (keyword, name) =>
        `${keyword}/${name}` === 'Weapon/TestBow'
          ? ['Weapon TestBow', '  PreAttackDelay = 500', '  PreAttackFX = FX_TestWindUp', '  FireFX = FX_TestBowFire', 'End']
          : DEFINITIONS[`${keyword}/${name}`],
    });
    const bow = groups.find((group) => group.title === 'Weapons')!.abilities[0];
    const [blast] = groups[0].abilities;

    assert.deepStrictEqual(
      bow.effects.map(({ name, delay }) => [name, delay]),
      [
        ['FX_TestWindUp', undefined],
        ['FX_TestBowFire', 0.5],
      ],
    );
    assert.ok(!blast.effects.some((effect) => effect.name === 'FX_TestWindUp'));
  });

  test('a cast walks its unpack, preparation, persistence and pack, each rounded up to a logic frame', async () => {
    const lines = [
      'Object TestCaster',
      '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
      '    DefaultModelConditionState',
      '      Model = TC_SKN',
      '    End',
      '    AnimationState = SPECIAL_WEAPON_TWO',
      '      Animation',
      '        AnimationName = TC.Blast',
      '      End',
      '    End',
      '  End',
      '  Behavior = WeaponFireSpecialAbilityUpdate ModuleTag_Blast',
      '    SpecialPowerTemplate = SpecialTestCast',
      '    WhichSpecialWeapon = 2',
      '    SkipContinue = Yes',
      '    UnpackTime = 900',
      '    PreparationTime = 1',
      '    PersistentPrepTime = 1500',
      '    PackTime = 1100',
      '    PlayWeaponPreFireFX = Yes',
      '    SpecialWeapon = TestBlastWeapon',
      '  End',
      '  Behavior = ArrowStormUpdate ModuleTag_Storm',
      '    SpecialPowerTemplate = SpecialTestStorm',
      '    UnpackingVariation = 1',
      '    UnpackTime = 1000',
      '    PreparationTime = 1',
      '    PersistentPrepTime = 500',
      '    WeaponTemplate = TestBlastWeapon',
      '    MaxShots = 3',
      '    FreezeAfterTriggerDuration = 900',
      '  End',
      '  Behavior = SpecialPowerModule ModuleTag_DominateStarter',
      '    SpecialPowerTemplate = SpecialTestDominate',
      '    UpdateModuleStartsAttack = Yes',
      '    SetModelCondition = ModelConditionState:USER_2',
      '    SetModelConditionTime = 2.1',
      '  End',
      '  Behavior = DominateEnemySpecialPower ModuleTag_Dominate',
      '    SpecialPowerTemplate = SpecialTestDominate',
      '    UnpackTime = 2000',
      '    PreparationTime = 1',
      '    DominatedFX = FX_TestHidden',
      '    TriggerFX = FX_TestTrigger',
      '  End',
      'End',
    ];
    const [abilities] = await listObjectAbilities(parseSageIni(lines, schema), readScene(lines)!, schema, SOURCES);
    const [cast, storm, dominate] = abilities.abilities;

    assert.deepStrictEqual(cast.phases, [
      { conditions: ['SPECIAL_WEAPON_TWO', 'UNPACKING'], start: 0, length: 1 },
      { conditions: ['SPECIAL_WEAPON_TWO', 'PREPARING'], start: 1, length: 1.8 },
      { conditions: ['SPECIAL_WEAPON_TWO', 'PACKING'], start: 2.8, length: 1.2 },
    ]);
    assert.deepStrictEqual(
      cast.effects.map(({ name, delay, repeat }) => [name, delay, repeat]),
      [
        ['FX_TestWindUp', undefined, undefined],
        ['FX_TestBlast', 1.2, undefined],
      ],
    );
    assert.deepStrictEqual(storm.phases, [
      { conditions: ['PACKING_TYPE_1', 'UNPACKING'], start: 0, length: 1 },
      { conditions: ['PACKING_TYPE_1', 'PREPARING'], start: 1, length: 2.4 },
    ]);
    assert.deepStrictEqual(
      storm.effects.map(({ name, delay, repeat }) => [name, delay, repeat]),
      [['FX_TestBlast', 1.2, { count: 2, every: 0.6 }]],
    );
    assert.deepStrictEqual(dominate.phases, [
      { conditions: ['UNPACKING'], start: 0, length: 2 },
      { conditions: ['PREPARING', 'USER_2'], start: 2, length: 0.2 },
      { conditions: ['USER_2'], start: 2.2, length: 1.8 },
    ]);
    assert.deepStrictEqual(
      dominate.effects.map(({ name, delay }) => [name, delay]),
      [
        ['FX_TestHidden', 2.2],
        ['FX_TestTrigger', 2.2],
      ],
    );
  });
});
