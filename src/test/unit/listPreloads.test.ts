import * as assert from 'assert';
import { listPreloads } from '../../game/objects/listPreloads';
import { toScene } from './objectFixtures';

const FORGE = [
  'Object TestForge',
  '  Draw = W3DScriptedModelDraw ModuleTag_Body',
  '    DefaultModelConditionState',
  '      Model = TF_SKN',
  '    End',
  '    ModelConditionState = user_1',
  '      Model = TF_SCAFFOLD',
  '    End',
  '    ModelConditionState = DAMAGED',
  '      Model = TF_DMG',
  '    End',
  '    AnimationState = Moving',
  '      Animation = None',
  '        AnimationName = None',
  '      End',
  '    End',
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_Build',
  '    TriggeredBy = Upgrade_Build',
  '    AddTempConditionFlag = USER_1',
  '  End',
  'End',
];

suite('Preload plan and state reading', () => {
  test('a state held only while something is built is planned last, however its header is cased', () => {
    const { models } = listPreloads(toScene(FORGE), [], {});

    assert.deepStrictEqual(
      models.map((model) => model.name),
      ['TF_SKN', 'TF_DMG', 'TF_SCAFFOLD'],
    );
  });

  test('an animation written None, in any casing, is no clip', () => {
    const scene = toScene(FORGE);

    assert.ok(!scene.states.some((state) => state.animations.some((name) => /^none$/i.test(name))));
  });
});
