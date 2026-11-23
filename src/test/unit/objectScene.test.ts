import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { findSceneFocus, readObjectScene } from '../../game/objects/objectScene';
import { loadSageIniSchema } from './loadSageIniSchema';

const schema = loadSageIniSchema();

const TEXT = [
  'Object TestHero',
  '  Draw = W3DHordeModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TH_SKN',
  '      ParticleSysBone = B_TORCH TorchFire FollowBone:Yes',
  '    End',
  '    ModelConditionState = USER_1',
  '      Model = TH_Cloak_SKN',
  '    End',
  '    AnimationState = MOVING',
  '      Animation = Run',
  '        AnimationName = TH_SKL.TH_RUNA',
  '        AnimationMode = LOOP',
  '      End',
  '      EnteringStateFX = FX_Dust',
  '    End',
  '  End',
  '  Behavior = SlowDeathBehavior ModuleTag_Death',
  '    FX = INITIAL FX_Fall',
  '  End',
  'End',
];

suite('Object scene', () => {
  const parsed = parseSageIni(TEXT, schema);
  const scene = readObjectScene(
    parsed,
    schema,
    (name) => name.startsWith('FX_'),
    (name) => name === 'TorchFire',
  )!;

  test('states carry their model, animations, FX and bone systems', () => {
    assert.deepStrictEqual(
      scene.states.map((state) => [
        state.label,
        state.kind,
        state.model,
        state.animations,
        state.fx,
        state.particles,
      ]),
      [
        [
          'DefaultModelConditionState',
          'model',
          'TH_SKN',
          [],
          [],
          [{ bone: 'B_TORCH', system: 'TorchFire' }],
        ],
        ['ModelConditionState = USER_1', 'model', 'TH_Cloak_SKN', [], [], []],
        [
          'AnimationState = MOVING',
          'animation',
          'TH_SKN',
          ['TH_SKL.TH_RUNA'],
          ['FX_Dust'],
          [],
        ],
      ],
    );
    assert.deepStrictEqual(scene.fx, [
      {
        field: 'FX',
        name: 'FX_Fall',
        module: 'SlowDeathBehavior',
        phase: 'INITIAL',
        when: ['DYING'],
      },
    ]);
  });

  test('a line opens the preview on its state and what it names', () => {
    assert.deepStrictEqual(findSceneFocus(parsed, 11, scene), {
      state: 2,
      animation: 'TH_SKL.TH_RUNA',
    });
    assert.deepStrictEqual(findSceneFocus(parsed, 18, scene), { fx: 'FX_Fall' });
    assert.deepStrictEqual(findSceneFocus(parsed, 4, scene), {
      state: 0,
      system: 'TorchFire',
    });
  });

  test('every voice and sound field is listed once, by the field naming it', () => {
    const voiced = parseSageIni(
      [
        'Object TestHero',
        '  VoiceSelect = TestHeroVoiceSelect',
        '  VoiceMove = TestHeroVoiceMove',
        '  VoiceMove = TestHeroVoiceMove',
        '  VoiceAttack = NONE',
        '  VoicePriority = 5',
        '  SoundOnDamaged = TestHeroHurt',
        '  EvaEventDieOwner = TestHeroLost',
        '  Behavior = SlowDeathBehavior ModuleTag_Death',
        '    Sound = INITIAL TestHeroDie',
        '  End',
        '  Draw = W3DModelDraw ModuleTag_Draw',
        '    DefaultModelConditionState',
        '      Model = TH_SKN',
        '    End',
        '  End',
        'End',
      ],
      schema,
    );
    const voices = readObjectScene(
      voiced,
      schema,
      () => false,
      () => false,
    )!.voices;

    assert.deepStrictEqual(voices, [
      { field: 'VoiceSelect', name: 'TestHeroVoiceSelect' },
      { field: 'VoiceMove', name: 'TestHeroVoiceMove' },
      { field: 'SoundOnDamaged', name: 'TestHeroHurt' },
      { field: 'EvaEventDieOwner', name: 'TestHeroLost' },
      { field: 'Sound', name: 'TestHeroDie', module: 'SlowDeathBehavior' },
    ]);
  });
});
