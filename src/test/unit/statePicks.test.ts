import * as assert from 'assert';
import { listAppearanceControls } from '../../game/objects/appearanceControls';
import { createPicks, getChoice } from '../../game/objects/appearancePicks';
import { listAppearanceOptions, listHeldConditions, pickModelState } from '../../game/objects/objectAppearance';
import type { ObjectScene } from '../../game/objects/objectScene';
import {
  applyStatePick,
  findStandingState,
  listPickedConditions,
  pickShownModelState,
} from '../../game/objects/statePicks';
import { toScene } from './objectFixtures';

const modelState = (conditions: string, model: string, texture?: string) => [
  `    ModelConditionState = ${conditions}`,
  `      Model = ${model}`,
  ...(texture ? [`      Texture = TT_Stone.tga ${texture}`] : []),
  '    End',
];

const animationState = (conditions: string, clip: string) => [
  `    AnimationState = ${conditions}`,
  '      Animation',
  `        AnimationName = ${clip}`,
  '      End',
  '    End',
];

const TOWER = [
  'Object TestTower',
  '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TT_A',
  '    End',
  ...modelState('UPGRADE_TEST_STONE BUILD_VARIATION_TWO', 'TT_B', 'TT_Stone_U.tga'),
  ...modelState('SNOW BUILD_VARIATION_TWO', 'TT_B', 'TT_Stone_Snow.tga'),
  ...modelState('BUILD_VARIATION_TWO DAMAGED', 'TT_B', 'TT_Stone_D.tga'),
  ...modelState('BUILD_VARIATION_ONE', 'TT_A'),
  ...modelState('BUILD_VARIATION_TWO', 'TT_B'),
  ...modelState('DYING', 'TT_DIE'),
  '    IdleAnimationState',
  '      Animation',
  '        AnimationName = TT_SKL.TT_IDLE',
  '      End',
  '    End',
  ...animationState('MOVING', 'TT_SKL.TT_MOVE'),
  ...animationState('MOVING DAMAGED', 'TT_SKL.TT_MOVE_HURT'),
  '  End',
  '  Behavior = ModelConditionUpgrade ModuleTag_Stone',
  '    TriggeredBy = Upgrade_TestStone',
  '    AddConditionFlags = UPGRADE_TEST_STONE',
  '  End',
  'End',
];

const getControls = (scene: ObjectScene) =>
  listAppearanceControls(scene, listAppearanceOptions([scene]));

const setUp = () => {
  const scene = toScene(TOWER);

  return { scene, controls: getControls(scene), picks: createPicks() };
};

const findState = (scene: ObjectScene, label: string) =>
  scene.states.find((state) => state.label.replace(/\s+/g, ' ') === label)!;

const getWorn = (scene: ObjectScene, held: readonly string[]) =>
  pickModelState(
    scene.states.filter((state) => state.draw === 'ModuleTag_Draw'),
    new Set(held),
  );

suite('State picks', () => {
  test('a picked model state hands its look to Appearance, where it can be switched again', () => {
    const { scene, controls, picks } = setUp();
    const state = findState(scene, 'ModelConditionState = SNOW BUILD_VARIATION_TWO');
    const actions = applyStatePick(scene, controls, picks, state);

    assert.deepStrictEqual(actions, []);
    assert.strictEqual(picks.isSnowy, true);
    assert.strictEqual(getWorn(scene, listPickedConditions(scene, controls, picks, actions)), state);

    picks.upgrades = ['Upgrade_TestStone'];
    const held = listPickedConditions(scene, controls, picks, actions);

    assert.ok(held.includes('SNOW') && held.includes('UPGRADE_TEST_STONE'));
    assert.strictEqual(
      getWorn(scene, held),
      findState(scene, 'ModelConditionState = UPGRADE_TEST_STONE BUILD_VARIATION_TWO'),
    );
    assert.strictEqual(findStandingState(scene, state, held, actions), undefined);
  });

  test('a picked model state lets go of what would have an earlier one worn in its place', () => {
    const { scene, controls, picks } = setUp();

    picks.upgrades = ['Upgrade_TestStone'];
    picks.isSnowy = true;

    const state = findState(scene, 'ModelConditionState = SNOW BUILD_VARIATION_TWO');
    const actions = applyStatePick(scene, controls, picks, state);

    assert.deepStrictEqual(picks.upgrades, []);
    assert.strictEqual(picks.isSnowy, true);
    assert.strictEqual(getWorn(scene, listPickedConditions(scene, controls, picks, actions)), state);
  });

  test('a picked animation state keeps what Appearance has no switch for as its own', () => {
    const { scene, controls, picks } = setUp();

    picks.isSnowy = true;

    const state = findState(scene, 'AnimationState = MOVING DAMAGED');
    const actions = applyStatePick(scene, controls, picks, state);
    const choice = getChoice(controls, picks);

    assert.deepStrictEqual(actions, ['MOVING']);
    assert.ok(choice.isSnowy);
    assert.deepStrictEqual(choice.conditions?.filter((each) => each === 'DAMAGED'), ['DAMAGED']);

    const held = listPickedConditions(scene, controls, picks, actions);

    assert.strictEqual(findStandingState(scene, state, held, actions), state);
  });

  test('a pick gives way to the state that stands for it once Appearance changes', () => {
    const scene = toScene(TOWER);
    const hurt = findState(scene, 'AnimationState = MOVING DAMAGED');
    const moving = findState(scene, 'AnimationState = MOVING');
    const intact = listHeldConditions(scene, { isSnowy: true });

    assert.strictEqual(findStandingState(scene, hurt, [...intact, 'MOVING'], ['MOVING']), moving);
    assert.strictEqual(findStandingState(scene, hurt, intact, []), undefined);
  });

  test('what dies is held beside the look, so the dying model is worn', () => {
    const { scene, controls, picks } = setUp();
    const state = findState(scene, 'ModelConditionState = DYING');
    const actions = applyStatePick(scene, controls, picks, state);

    assert.deepStrictEqual(actions, ['DYING']);
    assert.strictEqual(getWorn(scene, listPickedConditions(scene, controls, picks, actions)), state);
  });
});

suite('State picks on a hero who rides', () => {
  const rider = toScene([
    'Object TestRider',
    '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
    '    DefaultModelConditionState',
    '      Model = TR_FOOT_SKN',
    '    End',
    ...modelState('MOUNTED', 'TR_HORSE_SKN'),
    '    IdleAnimationState',
    '      Animation',
    '        AnimationName = TR_FOOT_SKL.TR_FOOT_IDLE',
    '      End',
    '    End',
    ...animationState('MOUNTED MOVING', 'TR_HORSE_SKL.TR_HORSE_RUN'),
    ...animationState('MOVING', 'TR_FOOT_SKL.TR_FOOT_RUN'),
    ...animationState('MOUNTED', 'TR_HORSE_SKL.TR_HORSE_IDLE'),
    '  End',
    'End',
  ]);
  const draw = 'ModuleTag_Draw';
  const label = (state: { label: string } | undefined) => state?.label.replace(/\s+/g, ' ');

  test('a state picked after a mounted one lets go of the horse, which would play another in its place', () => {
    const controls = getControls(rider);
    const picks = createPicks();

    applyStatePick(rider, controls, picks, findState(rider, 'AnimationState = MOUNTED MOVING'));
    assert.deepStrictEqual(getChoice(controls, picks).conditions, ['MOUNTED']);

    const running = findState(rider, 'AnimationState = MOVING');
    const actions = applyStatePick(rider, controls, picks, running);
    const held = listPickedConditions(rider, controls, picks, actions);

    assert.ok(!held.includes('MOUNTED'));
    assert.strictEqual(pickShownModelState(rider, draw, held)?.model, 'TR_FOOT_SKN');
    assert.strictEqual(findStandingState(rider, running, held, actions), running);
  });

  test('the idle picked while mounted stands on foot', () => {
    const controls = getControls(rider);
    const picks = createPicks();

    applyStatePick(rider, controls, picks, findState(rider, 'AnimationState = MOUNTED'));

    const actions = applyStatePick(rider, controls, picks, findState(rider, 'IdleAnimationState'));

    assert.ok(!listPickedConditions(rider, controls, picks, actions).includes('MOUNTED'));
  });

  test('a pick gives way to the state the game plays once the horse is switched on', () => {
    const running = findState(rider, 'AnimationState = MOVING');

    assert.strictEqual(
      label(findStandingState(rider, running, ['MOUNTED', 'MOVING'], ['MOVING'])),
      'AnimationState = MOUNTED MOVING',
    );
    assert.strictEqual(findStandingState(rider, running, ['MOVING'], ['MOVING']), running);
  });
});

suite('Shown model state', () => {
  const fortress = toScene([
    'Object TestFortress',
    '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
    '    DefaultModelConditionState',
    '      Model = None',
    '    End',
    ...modelState('WORLD_BUILDER', 'TF_KEEP'),
    ...modelState('BUILD_PLACEMENT_CURSOR', 'None'),
    ...modelState('RUBBLE', 'TF_RUBBLE'),
    ...modelState('ACTIVELY_BEING_CONSTRUCTED SNOW', 'TF_BUILD', 'TT_Stone_Snow.tga'),
    '  End',
    'End',
  ]);
  const pick = (held: string[]) =>
    pickShownModelState(fortress, 'ModuleTag_Draw', held)?.label.replace(/\s+/g, ' ');

  test('snow over a module that draws nothing as it stands keeps its first model standing in', () => {
    assert.strictEqual(pick([]), 'ModelConditionState = WORLD_BUILDER');
    assert.strictEqual(pick(['SNOW']), 'ModelConditionState = WORLD_BUILDER');
  });

  test('a state the conditions select is shown, one that draws nothing among them', () => {
    assert.strictEqual(pick(['RUBBLE', 'SNOW']), 'ModelConditionState = RUBBLE');
    assert.strictEqual(pick(['BUILD_PLACEMENT_CURSOR']), 'ModelConditionState = BUILD_PLACEMENT_CURSOR');
  });
});
