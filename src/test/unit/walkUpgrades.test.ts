import * as assert from 'assert';
import type { SceneUpgrade } from '../../game/objects/objectScene';
import { composeObject } from '../../game/objects/objectComposition';
import { listSubObjectRules } from '../../game/objects/subObjectRules';
import { walkUpgrades } from '../../game/objects/walkUpgrades';
import { toObject, toScene } from './objectFixtures';

const listRaised = (modules: readonly SceneUpgrade[]) =>
  modules.flatMap((module) => module.addsConditions ?? []);

const KEEP = [
  'Object TestKeep',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TK_SKN',
  '    End',
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_Stone',
  '    TriggeredBy = Upgrade_Stone',
  '    AddConditionFlags = USER_1',
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_Veteran',
  '    TriggeredBy = Upgrade_Level1 Upgrade_Stone',
  '    RequiresAllTriggers = Yes',
  '    AddConditionFlags = USER_2',
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_Tower',
  '    TriggeredBy = Upgrade_Tower Upgrade_Stone',
  '    RequiresAllTriggers = Yes',
  '    AddConditionFlags = USER_3',
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_Banner',
  '    TriggeredBy = Upgrade_Banner',
  '    AddConditionFlags = USER_4',
  '  End',
  'End',
];

const PLOT = [
  'Object TestPlot',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TP_SKN',
  '    End',
  '  End',
  '  Behavior = GrantUpgradeCreate ModuleTag_Free',
  '    UpgradeToGrant = Upgrade_Turret',
  '    GiveOnBuildComplete = Yes',
  '  End',
  '  Behavior = GrantUpgradeCreate ModuleTag_Banner',
  '    UpgradeToGrant = Upgrade_Banner',
  '  End',
  '  Behavior = ObjectCreationUpgrade ModuleTag_Plan',
  '    TriggeredBy = Upgrade_Turret',
  '    GrantUpgrade = Upgrade_HasTurret',
  '  End',
  '  Behavior = ObjectCreationUpgrade ModuleTag_Build',
  '    TriggeredBy = Upgrade_HasTurret',
  '    ThingToSpawn = TestTurret',
  '    Offset = X:12 Y:0 Z:51',
  '  End',
  '  Behavior = SubObjectsUpgrade ModuleTag_Mount',
  '    TriggeredBy = Upgrade_HasTurret',
  '    ShowSubObjects = MOUNT',
  '  End',
  '  Behavior = SubObjectsUpgrade ModuleTag_Plain',
  '    TriggeredBy = Upgrade_Banner',
  '    ConflictsWith = Upgrade_Turret',
  '    ShowSubObjects = PLAIN',
  '  End',
  'End',
];

suite('Upgrade walk', () => {
  test('GrantUpgradeCreate is read, a building completion apart', () => {
    assert.deepStrictEqual(toScene(PLOT).creationGrants, [
      { name: 'Upgrade_Turret', isOnCompletion: true },
      { name: 'Upgrade_Banner', isOnCompletion: false },
    ]);
  });

  test("a built object holds what GrantUpgradeCreate gives and what that grants in turn", () => {
    const scene = toScene(PLOT);
    const walk = walkUpgrades(scene);
    const spawning = scene.upgrades.find((module) => module.spawns === 'TestTurret');

    assert.ok(spawning && walk.created.includes(spawning));
    assert.ok(walk.active.has('upgrade_hasturret'));
    assert.deepStrictEqual(
      walk.created.flatMap((module) => module.shows),
      ['PLAIN', 'MOUNT'],
    );
    assert.deepStrictEqual(walk.firedOnCompletion.flatMap((module) => module.shows), ['MOUNT']);
  });

  test('a built expansion stands with the turret its GrantUpgradeCreate leads to', async () => {
    const turret = [
      'Object TestTurret',
      '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
      '    DefaultModelConditionState',
      '      Model = TT_SKN',
      '    End',
      '  End',
      'End',
    ];
    const { parts } = await composeObject(toObject(PLOT), {
      readObject: async (name) => (name === 'TestTurret' ? toObject(turret) : undefined),
    });
    const spawned = parts.find((part) => part.object === 'TestTurret');

    assert.ok(spawned?.isShown);
    assert.strictEqual(spawned.binding?.role, 'always');
    assert.deepStrictEqual(spawned.placement, { kind: 'offset', x: 12, y: 0, z: 51 });
  });

  test('a sub-object upgrade fired by what creation grants, or by what a held upgrade grants, shows its sub-objects', () => {
    const scene = toScene(PLOT);
    const state = scene.states.find((each) => each.kind === 'model');
    const listWrites = () =>
      listSubObjectRules(scene, state).map(({ pattern, hide }) => `${hide ? '-' : '+'}${pattern}`);

    assert.deepStrictEqual(listWrites(), ['+PLAIN', '+MOUNT']);

    scene.creationGrants = undefined;
    scene.heldUpgrades = ['Upgrade_Turret'];
    assert.deepStrictEqual(listWrites(), ['+MOUNT']);
  });

  test('a picked upgrade fires a module without its prerequisites only where it is one of its own triggers', () => {
    const scene = toScene(KEEP);

    scene.heldUpgrades = ['Upgrade_Level1'];

    assert.deepStrictEqual(listRaised(walkUpgrades(scene, ['Upgrade_Banner']).added), ['USER_4']);
    assert.deepStrictEqual(listRaised(walkUpgrades(scene, ['Upgrade_Tower']).added), ['USER_3']);
    assert.deepStrictEqual(listRaised(walkUpgrades(scene, ['Upgrade_Stone']).added), [
      'USER_1',
      'USER_2',
    ]);
  });

  test('a walk is worked out again when the scene is given other upgrades', () => {
    const scene = toScene(KEEP);

    assert.deepStrictEqual(listRaised(walkUpgrades(scene).created), []);
    scene.heldUpgrades = ['Upgrade_Banner'];
    assert.deepStrictEqual(listRaised(walkUpgrades(scene).created), ['USER_4']);
  });
});
