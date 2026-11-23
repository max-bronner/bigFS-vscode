import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { groupStates } from '../../game/objects/groupStates';
import { listStateEffects } from '../../game/objects/listStateEffects';
import { readObjectScene } from '../../game/objects/objectScene';
import { loadSageIniSchema } from './loadSageIniSchema';

const schema = loadSageIniSchema();

const TOWER = [
  'Object TestTower',
  '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
  '    LodOptions = LOW',
  '      AllowMultipleModels = No',
  '    End',
  '    DefaultModelConditionState',
  '      Model = TT_SKN',
  '      ParticleSysBone = B_TOP TowerSmoke',
  '    End',
  '    IdleAnimationState',
  '      Animation = Idle',
  '        AnimationName = TT_SKL.TT_IDLA',
  '      End',
  '    End',
  '    AnimationState = MOVING DYING',
  '      Animation = Fall',
  '        AnimationName = TT_SKL.TT_DIEA',
  '      End',
  '      FXEvent = Frame:12 Name:FX_Dust',
  '      FXEvent = Frame:30 Name: FX_Thud',
  '    End',
  '    AnimationState = DOOR_1_OPENING',
  '      Animation = Open',
  '        AnimationName = TT_SKL.TT_OPNA',
  '      End',
  '    End',
  '    TransitionState = TRANS_Idle_To_Open',
  '      Animation = Turn',
  '        AnimationName = TT_SKL.TT_TRNA',
  '      End',
  '    End',
  '  End',
  '  Behavior = TransitionDamageFX ModuleTag_Damage',
  '    ReallyDamagedFXList1 = Loc: X:0 Y:0 Z:0 FXList:FX_Crack',
  '    ReallyDamagedParticleSystem1 = Bone:B_TOP RandomBone:No PSys:TowerFire',
  '  End',
  '  Behavior = RespawnUpdate ModuleTag_Respawn',
  '    RespawnFX = FX_Return',
  '  End',
  'End',
];

const read = () =>
  readObjectScene(
    parseSageIni(TOWER, schema),
    schema,
    (name) => name.startsWith('FX_'),
    (name) => name.startsWith('Tower'),
    TOWER,
  )!;

suite('States and their effects', () => {
  test('states are grouped by what they are for, and detail settings are none', () => {
    assert.deepStrictEqual(
      groupStates(read().states).map(({ title, states }) => [title, states.map((each) => each.title)]),
      [
        ['Idle', ['idle']],
        ['Doors and production', ['door 1 opening']],
        ['Death', ['moving, dying']],
        ['Model states', ['default']],
        ['Transitions', ['Idle To Open']],
      ],
    );
  });

  test('a search finds a state by its words, clip or effect', () => {
    const find = (query: string) =>
      groupStates(read().states, query).flatMap(({ states }) => states.map((each) => each.title));

    assert.deepStrictEqual(find('tt_opna'), ['door 1 opening']);
    assert.deepStrictEqual(find('fx_thud'), ['moving, dying']);
    assert.deepStrictEqual(find('door opening'), ['door 1 opening']);
  });

  test('an effect is listed with the state that plays it, an event on its frame', () => {
    const scene = read();
    const worn = scene.states.find((each) => each.kind === 'model');
    const idle = scene.states.find((each) => each.label === 'IdleAnimationState');
    const dying = scene.states.find((each) => each.label.endsWith('DYING'));
    const atIdle = listStateEffects(scene, worn, idle, []);

    assert.deepStrictEqual(atIdle.playing.map((each) => each.name), ['TowerSmoke']);
    assert.deepStrictEqual(atIdle.others.map((each) => each.title), [
      'When really damaged',
      'Event: Respawn',
    ]);
    assert.deepStrictEqual(
      listStateEffects(scene, worn, dying, []).playing.map(({ name, frame }) => [name, frame]),
      [['TowerSmoke', undefined], ['FX_Dust', 12], ['FX_Thud', 30]],
    );
  });

  test('damage effects play once the object holds their damage', () => {
    const scene = read();
    const { playing, others } = listStateEffects(scene, undefined, undefined, ['REALLYDAMAGED']);

    assert.deepStrictEqual(
      playing.map(({ kind, name, bone }) => [kind, name, bone]),
      [['fxList', 'FX_Crack', undefined], ['system', 'TowerFire', 'B_TOP']],
    );
    assert.deepStrictEqual(others.map((each) => each.title), ['Event: Respawn']);
  });
});
