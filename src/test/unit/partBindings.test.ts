import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { listAppearanceControls } from '../../game/objects/appearanceControls';
import { applyPicks, createPicks, getChoice } from '../../game/objects/appearancePicks';
import { groupStates } from '../../game/objects/groupStates';
import { listAppearanceOptions } from '../../game/objects/objectAppearance';
import type { AppearanceChoice } from '../../game/objects/objectAppearance';
import { readLevelTables } from '../../game/objects/creationUpgrades';
import { composeObject } from '../../game/objects/objectComposition';
import type { ComposableObject } from '../../game/objects/objectComposition';
import { listSubObjectSwitches } from '../../game/objects/partBindings';
import { loadSageIniSchema } from './loadSageIniSchema';
import { toObject } from './objectFixtures';

const schema = loadSageIniSchema();

const KEEP = [
  'Object TestKeep',
  '  Side = Elves',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TK_SKN',
  '    End',
  '    AnimationState = RUBBLE',
  '      BeginScript',
  '        CurDrawableHideModule("ModuleTag_Banner")',
  '      EndScript',
  '    End',
  '  End',
  '  Draw = W3DScriptedModelDraw ModuleTag_Tower',
  '    DefaultModelConditionState',
  '      Model = None',
  '    End',
  '    ModelConditionState = UPGRADE_TOWER DAMAGED',
  '      Model = TT_DMG',
  '      Texture = TTower.tga TTower_Cracked.tga',
  '    End',
  '    ModelConditionState = UPGRADE_TOWER USER_2',
  '      Model = TT_BUILD',
  '    End',
  '    ModelConditionState = SNOW UPGRADE_TOWER',
  '      Model = TT_SKN',
  '      Texture = TTower.tga TTower_Snow.tga',
  '    End',
  '    ModelConditionState = UPGRADE_TOWER',
  '      Model = TT_SKN',
  '    End',
  '  End',
  '  Draw = W3DScriptedModelDraw ModuleTag_Banner',
  '    DefaultModelConditionState',
  '      Model = TB_SKN',
  '    End',
  '  End',
  '  Draw = W3DFloorDraw ModuleTag_Yard',
  '    ModelName = TY_BIB',
  '    StartHidden = Yes',
  '    WeatherTexture = SNOWY TYard_Snow.tga',
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_TowerUpgrade',
  '    TriggeredBy = Upgrade_Stone Upgrade_Tower',
  '    RequiresAllTriggers = Yes',
  '    AddConditionFlags = UPGRADE_TOWER',
  '    AddTempConditionFlag = ModelConditionState:USER_2',
  '  End',
  '  Behavior = SubObjectsUpgrade ModuleTag_StoneUpgrade',
  '    TriggeredBy = Upgrade_Stone',
  '    ShowSubObjects = ModuleTag_Yard TRIM',
  '  End',
  '  Behavior = CastleUpgrade ModuleTag_StoneOrder',
  '    TriggeredBy = Upgrade_StoneOrder',
  '    Upgrade = Upgrade_Stone',
  '  End',
  '  Behavior = ObjectCreationUpgrade ModuleTag_Engines',
  '    TriggeredBy = Upgrade_Engines',
  '    GrantUpgrade = Upgrade_HasEngine',
  '  End',
  '  Behavior = ObjectCreationUpgrade ModuleTag_MenEngine',
  '    TriggeredBy = Upgrade_HasEngine Upgrade_MenFaction',
  '    RequiresAllTriggers = Yes',
  '    ThingToSpawn = TestCatapult',
  '    Offset = X:4.5 Y:-2 Z:30',
  '  End',
  '  Behavior = ObjectCreationUpgrade ModuleTag_ElfEngine',
  '    TriggeredBy = Upgrade_HasEngine Upgrade_ElfFaction',
  '    RequiresAllTriggers = Yes',
  '    ThingToSpawn = TestBallista',
  '    Offset = X:4.5 Y:-2 Z:30',
  '  End',
  'End',
];

const toMember = (name: string) => [
  `Object ${name}`,
  '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  `      Model = ${name}_SKN`,
  '    End',
  '    ModelConditionState = DAMAGED',
  `      Model = ${name}_DMG`,
  '    End',
  '  End',
  'End',
];
const MEMBERS = ['TestCatapult', 'TestBallista', 'TestSoldier', 'TestBearer'];

const HORDE = [
  'Object TestBand',
  '  Behavior = HordeContain ModuleTag_Horde',
  '    Slots = 1',
  '    InitialPayload = TestSoldier 1',
  '    RankInfo = RankNumber:1 UnitType:TestSoldier Position:X:10 Y:0',
  '    BannerCarriersAllowed = TestBearer',
  '    BannerCarrierPosition = UnitType:TestSoldier Pos:X:30 Y:0',
  '  End',
  'End',
];

const compose = (object: ComposableObject, choice: AppearanceChoice = {}) =>
  composeObject(
    object,
    {
      readObject: (name) =>
        Promise.resolve(MEMBERS.includes(name) ? toObject(toMember(name)) : undefined),
      resolveMacro: () => undefined,
    },
    [],
    choice,
  );

const getPart = async (name: string, choice: AppearanceChoice = {}) => {
  const { parts } = await compose(toObject(KEEP), choice);

  return parts.find((part) => part.draw === name || part.object === name)!;
};

const BUILT = ['Upgrade_Stone', 'Upgrade_Tower'];

suite('Part bindings', () => {
  test('a part with no model until its upgrade is off, and lists what adds it', async () => {
    const tower = await getPart('ModuleTag_Tower');

    assert.strictEqual(tower.isShown, false);
    assert.strictEqual(tower.binding?.role, 'upgrade');
    assert.deepStrictEqual(tower.binding?.show, { give: ['Upgrade_Tower'] });
    assert.deepStrictEqual(tower.binding?.needs, ['Upgrade_Stone']);
    assert.strictEqual(tower.model, 'TT_SKN');
  });

  test('its upgrade alone shows it, and what it needs alone does not', async () => {
    const tower = await getPart('ModuleTag_Tower', { upgrades: ['Upgrade_Tower'] });
    const yard = await getPart('ModuleTag_Yard', { upgrades: ['Upgrade_Tower'] });

    assert.deepStrictEqual([tower.isShown, yard.isShown], [true, false]);
    assert.strictEqual(
      (await getPart('ModuleTag_Tower', { upgrades: ['Upgrade_Stone'] })).isShown,
      false,
    );
  });

  test('a faction is no prerequisite, and nothing else brings what needs it', async () => {
    const without = await getPart('TestBallista', { upgrades: ['Upgrade_Engines'] });

    assert.strictEqual(without.isShown, false);
    assert.deepStrictEqual(without.binding?.show, {
      give: ['Upgrade_HasEngine', 'Upgrade_ElfFaction'],
    });
  });

  test('taking it off takes its own upgrade, not what that needs', async () => {
    const tower = await getPart('ModuleTag_Tower', { upgrades: BUILT });

    assert.strictEqual(tower.isShown, true);
    assert.deepStrictEqual(tower.binding?.hide, { take: ['Upgrade_Tower'] });
  });

  test('snow and damage reach it in the order of its own states', async () => {
    const getLook = async (choice: AppearanceChoice) => {
      const { model, textures } = await getPart('ModuleTag_Tower', { upgrades: BUILT, ...choice });

      return [model, textures?.flat().map((swap) => swap.to) ?? []];
    };

    assert.deepStrictEqual(await getLook({ isSnowy: true }), ['TT_SKN', ['TTower_Snow.tga']]);
    assert.deepStrictEqual(await getLook({ isSnowy: true, conditions: ['DAMAGED'] }), [
      'TT_DMG',
      ['TTower_Cracked.tga'],
    ]);
  });

  test('one not added yet lists the look it would come with', async () => {
    const tower = await getPart('ModuleTag_Tower', { conditions: ['DAMAGED'] });

    assert.deepStrictEqual([tower.isShown, tower.model], [false, 'TT_DMG']);
  });

  test('a floor an upgrade names follows it, and wears snow', async () => {
    const hidden = await getPart('ModuleTag_Yard');
    const shown = await getPart('ModuleTag_Yard', { upgrades: ['Upgrade_Stone'], isSnowy: true });

    assert.deepStrictEqual(
      [hidden.isShown, hidden.binding?.show],
      [false, { give: ['Upgrade_Stone'] }],
    );
    assert.deepStrictEqual([shown.isShown, shown.isFloor], [true, true]);
    assert.deepStrictEqual(shown.textures, [[{ to: 'TYard_Snow.tga' }]]);
  });

  test('a script without a clip switches a module off by its tag while its state holds', async () => {
    const ruined = await getPart('ModuleTag_Banner', { conditions: ['RUBBLE'] });

    assert.strictEqual((await getPart('ModuleTag_Banner')).isShown, true);
    assert.strictEqual(ruined.isShown, false);
  });

  test('what an upgrade grants is given, and is taken back by its source', async () => {
    const choice = { upgrades: ['Upgrade_StoneOrder', 'Upgrade_Tower'] };
    const yard = await getPart('ModuleTag_Yard', choice);

    assert.strictEqual((await getPart('ModuleTag_Tower', choice)).isShown, true);
    assert.deepStrictEqual(yard.binding?.hide, { take: ['Upgrade_StoneOrder'] });
  });

  test('an object an upgrade creates stands at its offset in the damage shown, by faction', async () => {
    const upgrades = ['Upgrade_ElfFaction', 'Upgrade_Engines'];
    const ballista = await getPart('TestBallista', { upgrades, conditions: ['DAMAGED'] });
    const catapult = await getPart('TestCatapult', { upgrades });

    assert.deepStrictEqual([ballista.isShown, ballista.model], [true, 'TestBallista_DMG']);
    assert.deepStrictEqual(ballista.placement, { kind: 'offset', x: 4.5, y: -2, z: 30 });
    assert.deepStrictEqual(ballista.binding?.hide, { take: ['Upgrade_Engines'] });
    assert.strictEqual(catapult.isShown, false);
  });

  test('upgrades that show sub-objects bind them both ways', () => {
    const { scene } = toObject(KEEP);
    const find = (picked: string[]) =>
      listSubObjectSwitches(scene, picked).find((each) => each.pattern === 'TRIM');

    assert.deepStrictEqual(find([])?.show, { give: ['Upgrade_Stone'] });
    assert.deepStrictEqual(find(['Upgrade_Stone'])?.hide, { take: ['Upgrade_Stone'] });
  });

  test("a part's change moves its own switch of Appearance and no other", async () => {
    const object = toObject(KEEP);
    const { appearance, parts } = await compose(object);
    const controls = listAppearanceControls(object.scene, appearance!);
    const picks = createPicks();
    const tower = parts.find((part) => part.draw === 'ModuleTag_Tower')!;

    assert.strictEqual(controls.factions[0].names[0], 'Upgrade_ElfFaction');
    assert.ok(!controls.forms.some((form) => form.conditions.includes('USER_2')));
    applyPicks(controls, picks, tower.binding!.show!);
    assert.deepStrictEqual(picks.upgrades, ['Upgrade_Tower']);
    applyPicks(controls, picks, { give: ['Upgrade_Stone'] });
    applyPicks(controls, picks, { take: ['Upgrade_Tower'] });
    assert.deepStrictEqual(picks.upgrades, ['Upgrade_Stone']);
    applyPicks(controls, picks, { give: ['Upgrade_MenFaction'] });
    assert.deepStrictEqual(getChoice(controls, picks).upgrades, [
      'Upgrade_MenFaction',
      'Upgrade_Stone',
    ]);
  });

  test("a horde's banner joins with its level, and its checkbox reaches that level", async () => {
    const object = toObject(HORDE);

    object.scene.levels = [
      { rank: 1, required: 0, upgrades: [] },
      { rank: 2, required: 100, upgrades: [] },
    ];

    const getBearer = async (choice: AppearanceChoice) =>
      (await compose(object, choice)).parts.find((part) => part.object === 'TestBearer')!;
    const controls = listAppearanceControls(object.scene, listAppearanceOptions([object.scene]));
    const picks = createPicks();
    const before = await getBearer({});

    assert.deepStrictEqual([before.isShown, before.binding?.show], [false, { level: 1 }]);
    applyPicks(controls, picks, before.binding!.show!);

    const after = await getBearer(getChoice(controls, picks));

    assert.deepStrictEqual([after.isShown, after.binding?.hide], [true, { belowLevel: 1 }]);
    applyPicks(controls, picks, after.binding!.hide!);
    assert.strictEqual(picks.level, '');
  });

  test('any upgrade that holds an AnimState binds the module its script shows', async () => {
    const gate = toObject([
      'Object TestWall',
      '  Draw = W3DScriptedModelDraw ModuleTag_Wall',
      '    DefaultModelConditionState',
      '      Model = TW_SKN',
      '    End',
      '  End',
      '  Draw = W3DScriptedModelDraw ModuleTag_Gate',
      '    DefaultModelConditionState',
      '      Model = TG_SKN',
      '    End',
      '    IdleAnimationState',
      '      BeginScript',
      '        CurDrawableHideModule("ModuleTag_Gate")',
      '      EndScript',
      '    End',
      '    AnimationState = UPGRADE_POSTERN_GATE',
      '      Flags = START_FRAME_LAST',
      '      Animation = Rise',
      '        AnimationName = TG_SKL.TG_RISE',
      '        AnimationMode = ONCE',
      '      End',
      '      BeginScript',
      '        CurDrawableShowModule("ModuleTag_Gate")',
      '      EndScript',
      '    End',
      '  End',
      '  Behavior = AttributeModifierUpgrade ModuleTag_GateUpgrade',
      '    TriggeredBy = Upgrade_Gate',
      '    CustomAnimAndDuration = AnimState:UPGRADE_POSTERN_GATE AnimTime:0',
      '  End',
      'End',
    ]);
    const getGate = async (choice: AppearanceChoice) =>
      (await compose(gate, choice)).parts.find((part) => part.draw === 'ModuleTag_Gate')!;
    const closed = await getGate({});
    const open = await getGate({ upgrades: ['Upgrade_Gate'] });

    assert.deepStrictEqual([closed.isShown, closed.binding?.show], [false, { give: ['Upgrade_Gate'] }]);
    assert.deepStrictEqual([open.isShown, open.binding?.hide], [true, { take: ['Upgrade_Gate'] }]);
    assert.strictEqual(open.holdsLastFrame, true, 'it stands built');
    assert.deepStrictEqual(listAppearanceOptions([gate.scene]).upgrades, ['Upgrade_Gate']);
  });

  test('a macro in TargetNames gives each object it names the level', () => {
    const levels = parseSageIni(
      [
        'ExperienceLevel TroopLevel2',
        '  TargetNames = TEST_TROOPS TestLone',
        '  RequiredExperience = 50',
        '  Rank = 2',
        'End',
      ],
      schema,
    );
    const macros = new Map([
      ['TEST_TROOPS', 'TestBand  TEST_MORE'],
      ['TEST_MORE', 'TestBlock'],
      ['TEST_LOOP', 'TEST_LOOP'],
    ]);
    const tables = readLevelTables([levels], (name) => macros.get(name));

    assert.deepStrictEqual([...tables.keys()].sort(), ['testband', 'testblock', 'testlone']);
  });

  test('a state held only while an upgrade is built is construction', () => {
    const { scene } = toObject([
      'Object TestLift',
      '  Draw = W3DScriptedModelDraw ModuleTag_Body',
      '    AnimationState = USER_2',
      '      Animation = Rise',
      '        AnimationName = TL_SKL.TL_RISE',
      '      End',
      '    End',
      '  End',
      'End',
    ]);

    assert.deepStrictEqual(
      groupStates(scene.states, '', new Set(['USER_2'])).map((group) => group.title),
      ['Construction'],
    );
  });
});
