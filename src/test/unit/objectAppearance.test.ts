import * as assert from 'assert';
import { findHidingSources, isSubObjectNamed } from '../../formats/w3d/w3dScene';
import { swapTextures } from '../../formats/w3d/w3dTextureSwaps';
import type { W3dMesh } from '../../formats/w3d/w3dTools';
import { getModelFileName } from '../../game/objects/findRelatedModels';
import {
  listAppearanceOptions,
  listHeldConditions,
  listTextureLayers,
  listTextureVariants,
  pickModelState,
} from '../../game/objects/objectAppearance';
import { composeObject } from '../../game/objects/objectComposition';
import { pickPlayingClip } from '../../game/objects/drawStates';
import { listSubObjectRules } from '../../game/objects/subObjectRules';
import { toObject } from './objectFixtures';

const HUT = [
  'Object TestHut',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    RandomTexture = THut_A.tga 0 THut_A.tga',
  '    RandomTexture = THut_B.tga 0 THut_A.tga',
  '    RandomTexture = THut_Lone.tga 0',
  '    DefaultModelConditionState',
  '      Model = TH_SKN',
  '      Texture = TWall.tga TWall_Plain.tga',
  '    End',
  '    ModelConditionState = DAMAGED SNOW',
  '      Model = TH_DMG',
  '    End',
  '    ModelConditionState = SNOW',
  '      Texture = THut_A.tga THut_Snow.tga',
  '    End',
  '    ModelConditionState = DAMAGED',
  '      Texture = TWall.tga TWall_Cracked.tga',
  '    End',
  '    ModelConditionState = DAMAGED SNOW USER_1',
  '      Model = TH_LATE',
  '    End',
  '    ModelConditionState = WEAPONSET_PLAYER_UPGRADE',
  '      Model = TH_ARMED',
  '    End',
  '    ModelConditionState = USER_2',
  '      Model = TH_TOWER',
  '    End',
  '  End',
  '  Draw = W3DScriptedModelDraw ModuleTag_Sign',
  '    StartHidden = Yes',
  '    DefaultModelConditionState',
  '      Model = TH_SIGN',
  '    End',
  '  End',
  '  Draw = W3DScriptedModelDraw ModuleTag_Scaffold',
  '    HideIfModelConditions = SNOW',
  '    DefaultModelConditionState',
  '      Model = TH_SCAF',
  '    End',
  '  End',
  '  Draw = W3DFloorDraw ModuleTag_Floor',
  '    ModelName = TH_BIB',
  '    WeatherTexture = SNOWY THut_Bib_Snow.tga',
  '  End',
  '  Behavior = SubObjectsUpgrade ModuleTag_Paint',
  '    TriggeredBy = Upgrade_Paint',
  '    UpgradeTexture = THut_A.tga 0 THut_Paint.tga',
  '    ExcludeSubobjects = DOOR',
  '    ShowSubObjects = TRIM',
  '  End',
  '  Behavior = SubObjectsUpgrade ModuleTag_Gild',
  '    TriggeredBy = Upgrade_Gild',
  '    ConflictsWith = Upgrade_Plain',
  '    UpgradeTexture = THut_A.tga 0 THut_Gold.tga',
  '    ShowSubObjects = ModuleTag_Sign',
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_Tower',
  '    TriggeredBy = Upgrade_Tower Upgrade_Stone',
  '    RequiresAllTriggers = Yes',
  '    AddConditionFlags = USER_2',
  '  End',
  '  Behavior = WeaponSetUpgrade ModuleTag_Arms',
  '    TriggeredBy = Upgrade_Arms',
  '  End',
  'End',
];

const getState = (conditions: string[]) =>
  pickModelState(toObject(HUT).scene.states, new Set(conditions));

const getSwaps = (conditions: string[], choice = {}) => {
  const { scene } = toObject(HUT);
  const state = pickModelState(scene.states, new Set(conditions));

  return listTextureLayers(scene, 'ModuleTag_Body', state, choice).map((layer) =>
    layer.map((swap) => `${swap.from}>${swap.to}`),
  );
};

suite('Object appearance', () => {
  test('the first declared state whose every condition holds wins, not the most specific, else the default', () => {
    assert.strictEqual(getState([])?.model, 'TH_SKN');
    assert.strictEqual(getState(['SNOW'])?.model, 'TH_SKN');
    assert.strictEqual(getState(['SNOW', 'DAMAGED'])?.model, 'TH_DMG');
    assert.strictEqual(getState(['SNOW', 'DAMAGED', 'USER_1'])?.model, 'TH_DMG');
    assert.strictEqual(getState(['USER_1'])?.label, 'DefaultModelConditionState');
  });

  test("a state wears the default's swaps under its own, its own winning on the same texture", () => {
    assert.deepStrictEqual(getSwaps([]), [['TWall.tga>TWall_Plain.tga']]);
    assert.deepStrictEqual(getSwaps(['SNOW']), [
      ['TWall.tga>TWall_Plain.tga', 'THut_A.tga>THut_Snow.tga'],
    ]);
    assert.deepStrictEqual(getSwaps(['DAMAGED']), [['TWall.tga>TWall_Cracked.tga']]);
  });

  test("the last fired upgrade's list is in force, behind the state's own", () => {
    const upgrades = ['Upgrade_Paint', 'Upgrade_Gild'];

    assert.deepStrictEqual(getSwaps([], { upgrades }), [
      ['TWall.tga>TWall_Plain.tga', 'THut_A.tga>THut_Gold.tga'],
    ]);
    assert.deepStrictEqual(getSwaps([], { upgrades: [...upgrades].reverse() }), [
      ['TWall.tga>TWall_Plain.tga', 'THut_A.tga>THut_Paint.tga'],
    ]);
    assert.deepStrictEqual(getSwaps(['SNOW'], { upgrades }), [
      ['TWall.tga>TWall_Plain.tga', 'THut_A.tga>THut_Snow.tga', 'THut_A.tga>THut_Gold.tga'],
    ]);
    assert.deepStrictEqual(getSwaps([], { upgrades: ['Upgrade_Plain', 'Upgrade_Gild'] }), [
      ['TWall.tga>TWall_Plain.tga'],
    ]);
  });

  test('upgrades raise conditions as their triggers say', () => {
    const { scene } = toObject(HUT);

    assert.deepStrictEqual(listHeldConditions(scene, { upgrades: ['Upgrade_Tower'] }), []);
    assert.deepStrictEqual(
      listHeldConditions(scene, { upgrades: ['upgrade_tower', 'Upgrade_Stone', 'Upgrade_Arms'], isSnowy: true }),
      ['USER_2', 'WEAPONSET_PLAYER_UPGRADE', 'SNOW'],
    );
    scene.heldUpgrades = ['Upgrade_Arms'];
    assert.deepStrictEqual(listHeldConditions(scene), ['WEAPONSET_PLAYER_UPGRADE']);
  });

  test('a picked upgrade writes its sub-objects, and one held from creation obeys its conflicts', () => {
    const { scene } = toObject(HUT);
    const state = pickModelState(scene.states, new Set());
    const parts = [{ container: 'TH_SKN', name: 'TRIM', hidden: true, bone: 0 }];
    const hiding = (picked: string[] = []) =>
      findHidingSources(parts, listSubObjectRules(scene, state, picked))[0];

    assert.ok(hiding());
    assert.strictEqual(hiding(['Upgrade_Paint']), undefined);
    scene.heldUpgrades = ['Upgrade_Gild', 'Upgrade_Plain'];
    assert.ok(!listSubObjectRules(scene, state).some((rule) => rule.pattern === 'ModuleTag_Sign'));
  });

  test('a random skin is a layer below, and a line not naming what it replaces is left out', () => {
    assert.deepStrictEqual(getSwaps([], { randomTexture: 1 })[0], ['THut_A.tga>THut_B.tga']);
    assert.deepStrictEqual(getSwaps([], { randomTexture: 2 })[0], ['THut_A.tga>THut_A.tga']);
    assert.strictEqual(toObject(HUT).scene.randomTextures?.length, 2);
  });

  test('a state without a clip stands a switched model and lets an unswitched one idle', () => {
    const { scene } = toObject([
      'Object TestMill',
      '  Draw = W3DScriptedModelDraw ModuleTag_Body',
      '    DefaultModelConditionState',
      '      Model = TM_SKN',
      '    End',
      '    ModelConditionState = DAMAGED',
      '      Model = TM_D1SK',
      '    End',
      '    IdleAnimationState',
      '      Animation = Turn',
      '        AnimationName = TM_SKL.TM_IDLA',
      '      End',
      '    End',
      '    AnimationState = DAMAGED',
      '    End',
      '    AnimationState = AFLAME',
      '    End',
      '    AnimationState = RUBBLE',
      '      Animation = Fall',
      '        AnimationName = TM_D3SK.TM_FALL',
      '      End',
      '    End',
      '  End',
      'End',
    ]);
    const pick = (...held: string[]) => pickPlayingClip(scene, 'ModuleTag_Body', held);

    assert.strictEqual(pick(), 'TM_SKL.TM_IDLA');
    assert.strictEqual(pick('DAMAGED'), undefined);
    assert.strictEqual(pick('AFLAME'), 'TM_SKL.TM_IDLA');
    assert.strictEqual(pick('RUBBLE'), 'TM_D3SK.TM_FALL');
  });

  test('only what changes a look is offered', () => {
    const { scene } = toObject(HUT);

    assert.deepStrictEqual(listAppearanceOptions([scene]), {
      canSnow: true,
      upgrades: ['Upgrade_Arms', 'Upgrade_Gild', 'Upgrade_Paint', 'Upgrade_Stone', 'Upgrade_Tower'],
      randomTextureCount: 2,
      needs: { upgrade_stone: ['Upgrade_Tower'], upgrade_tower: ['Upgrade_Stone'] },
    });
  });

  test('the W3D preview is offered each swap once, a floor for its snow among them', () => {
    const { scene } = toObject(HUT);
    const variants = listTextureVariants([scene, scene], getModelFileName);
    const floor = variants.filter((each) => each.model === 'th_bib.w3d');

    assert.deepStrictEqual(floor, [
      { model: 'th_bib.w3d', label: 'Snow (TestHut)', layers: [[{ to: 'THut_Bib_Snow.tga' }]] },
    ]);

    const labels = variants.filter((each) => each.model === 'th_skn.w3d').map((each) => each.label);

    assert.ok(labels.includes('Snow (TestHut)'));
    assert.ok(labels.includes('Upgrade_Paint (TestHut)'));
    assert.ok(labels.includes('Random: thut_b (TestHut)'));
    assert.strictEqual(new Set(labels).size, labels.length);
  });

  test('snow and upgrades switch whole draw modules and reach a horde\'s members, conditions do not', async () => {
    const horde = [
      'Object TestHutHorde',
      '  Behavior = HordeContain ModuleTag_Horde',
      '    InitialPayload = TestHut 1',
      '    Slots = 1',
      '    RankInfo = RankNumber:1 UnitType:TestHut Position:X:0 Y:0',
      '  End',
      'End',
    ];
    const sources = { readObject: async () => toObject(HUT) };
    const own = await composeObject(toObject(HUT), sources, [], {
      isSnowy: true,
      upgrades: ['Upgrade_Gild'],
    });
    const shownByDraw = new Map(own.parts.map((part) => [part.draw, part.isShown]));

    assert.strictEqual(shownByDraw.get('ModuleTag_Sign'), true);
    assert.strictEqual(shownByDraw.get('ModuleTag_Scaffold'), false);

    const { parts, appearance } = await composeObject(toObject(horde), sources, [], {
      upgrades: ['Upgrade_Gild'],
      conditions: ['DAMAGED'],
    });
    const member = parts.find((part) => part.object === 'TestHut')!;

    assert.strictEqual(member.model, 'TH_SKN');
    assert.deepStrictEqual(
      member.textures?.[0].map((swap) => swap.to),
      ['TWall_Plain.tga', 'THut_Gold.tga'],
    );
    assert.ok(appearance?.canSnow && appearance.upgrades.includes('Upgrade_Gild'));
  });

  test('swaps match by stem, layer by layer, spare excluded parts and keep a texture whose replacement is missing', async () => {
    const mesh = (name: string, texture: string) =>
      ({
        container: 'TH_SKN',
        name,
        draws: [{ texture: { name: texture, clampU: false, clampV: false } }],
      }) as unknown as W3dMesh;
    const source = [mesh('BODY', 'art\\THUT_A.dds'), mesh('DOOR', 'THut_A.tga'), mesh('WALL', 'TWall.tga')];
    const files = new Set(['thut_b.tga', 'thut_gold.dds', 'twall_white.png']);
    const { meshes, missing } = await swapTextures(
      source,
      [
        [{ from: 'THut_A.tga', to: 'THut_B.tga', exclude: ['DOOR'] }],
        [
          { from: 'THut_B.tga', to: 'THut_Absent.tga' },
          { from: 'thut_b', to: 'THut_Gold.tga' },
          { from: 'TWall.tga', to: 'TWall_Absent.tga' },
          { from: 'TWall.tga', to: 'TWall_White.tga' },
        ],
      ],
      async (name) => (files.has(name) ? Buffer.from([1]) : undefined),
      isSubObjectNamed,
    );

    assert.deepStrictEqual(
      meshes.map((each) => each.draws[0].texture?.name),
      ['THut_Gold.tga', 'THut_A.tga', 'TWall_White.tga'],
    );
    assert.deepStrictEqual(missing, ['THut_Absent.tga', 'TWall_Absent.tga']);
    assert.strictEqual(source[0].draws[0].texture?.name, 'art\\THUT_A.dds');
  });

  test('an upgrade that only shows or hides sub-objects the models lack is not offered', async () => {
    const lines = [
      'Object TestCatapult',
      '  Draw = W3DScriptedModelDraw ModuleTag_Body',
      '    DefaultModelConditionState',
      '      Model = TC_SKN',
      '    End',
      '  End',
      '  Behavior = SubObjectsUpgrade ModuleTag_Fire',
      '    TriggeredBy = Upgrade_Fire',
      '    ShowSubObjects = FirePlane',
      '  End',
      '  Behavior = SubObjectsUpgrade ModuleTag_Flag',
      '    TriggeredBy = Upgrade_Flag',
      '    ShowSubObjects = FLAG*',
      '  End',
      '  Behavior = SubObjectsUpgrade ModuleTag_Body',
      '    TriggeredBy = Upgrade_Body',
      '    HideSubObjects = ModuleTag_Body',
      '  End',
      'End',
    ];
    const offered = async (meshes: string[] | undefined) =>
      (
        await composeObject(toObject(lines), {
          readObject: async () => undefined,
          listSubObjects: async () => meshes,
        })
      ).appearance?.upgrades;

    assert.deepStrictEqual(await offered(['TC_SKN.FIREPLANE01', 'TC_SKN.FLAG02']), [
      'Upgrade_Body',
      'Upgrade_Flag',
    ]);
    assert.deepStrictEqual(await offered(['TC_SKN.FIREPLANE']), ['Upgrade_Body', 'Upgrade_Fire']);
    assert.deepStrictEqual(await offered(undefined), ['Upgrade_Body', 'Upgrade_Fire', 'Upgrade_Flag']);
  });
});
