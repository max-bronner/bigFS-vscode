import * as assert from 'assert';
import type { ListedEffect } from '../../game/objects/listStateEffects';
import { createEffectSwitches } from '../../webview/particles/effectSwitches';
import { getKeptLevel, isShowingBones } from '../../webview/shared/viewer/createViewControls';
import type { ViewerModel } from '../../webview/shared/viewer/describeModel';
import { createPartSwitches } from '../../webview/shared/viewer/createPartSwitches';
import { findRedrawnState } from '../../webview/particles/findRedrawnState';
import { isFieldKey } from '../../webview/shared/viewer/isFieldKey';
import type { SceneState } from '../../game/objects/objectScene';

const toEffect = (name: string): ListedEffect => ({ kind: 'fxList', name, detail: '' });

const toState = (label: string, draw = 'ModuleTag_Draw'): SceneState =>
  ({ draw, kind: 'model', label, animations: [], fx: [], particles: [], subObjects: {} }) as unknown as SceneState;

suite('View settings', () => {
  test('bones follow the user, and else show for a file of bones alone opened as itself', () => {
    const skeleton = { meshes: [], skeleton: {} } as unknown as ViewerModel;
    const unit = { meshes: [{}], skeleton: {} } as unknown as ViewerModel;

    assert.deepStrictEqual(
      [
        isShowingBones(undefined, skeleton, true),
        isShowingBones(undefined, skeleton, false),
        isShowingBones(undefined, unit, true),
        isShowingBones(undefined, undefined, true),
        isShowingBones(false, skeleton, true),
        isShowingBones(true, unit, false),
      ],
      [true, false, false, false, false, true],
    );
  });

  test('a picked detail level holds on a model that has it and more than one', () => {
    assert.deepStrictEqual(
      [getKeptLevel(3, 1), getKeptLevel(2, 2), getKeptLevel(1, 0), getKeptLevel(3, undefined)],
      [1, undefined, undefined, undefined],
    );
  });

  test('an effect switched by hand stays so through a change of state', () => {
    const switches = createEffectSwitches();
    const smoke = toEffect('FX_Smoke');
    const fire = toEffect('FX_Fire');

    switches.list([smoke], [fire]);
    switches.pick(smoke, false);
    switches.pick(fire, true);

    const [smokeNow, fireNow, dust] = [toEffect('FX_Smoke'), toEffect('FX_Fire'), toEffect('FX_Dust')];

    switches.list([smokeNow, dust], [fireNow]);
    assert.deepStrictEqual(switches.getOn(), [dust, fireNow]);
  });

  test('asked from an effect it is on alone, and an edit asking again keeps what was switched', () => {
    const switches = createEffectSwitches();
    const smoke = toEffect('FX_Smoke');
    const fire = toEffect('FX_Fire');

    switches.pick(fire, false);
    switches.list([smoke, fire], [], 'fx_fire');
    assert.deepStrictEqual(switches.getOn(), [fire]);

    switches.pick(fire, false);
    switches.list([smoke, fire], [], 'fx_fire');
    assert.deepStrictEqual(switches.getOn(), []);
  });

  test('a part switched by hand comes back with its model after a round trip through another', () => {
    const switches = createPartSwitches();

    switches.setModel('a.body a.flag');
    switches.setHidden([false, true]);
    switches.switchPart(1, true);
    switches.setHidden([false, false]);
    switches.setModel('b.body');
    switches.setHidden([false]);
    switches.setHidden([true]);
    switches.setModel('a.body a.flag');
    switches.setHidden([false, true]);
    assert.deepStrictEqual([...switches.overrides], [[1, true]]);
  });

  test('a switch follows the game while it hides the part otherwise, and holds again after', () => {
    const switches = createPartSwitches();

    switches.setModel('a');
    switches.setHidden([true, false]);
    switches.switchPart(0, true);
    switches.setHidden([false, false]);
    assert.deepStrictEqual([...switches.overrides], []);
    switches.setHidden([true, false]);
    assert.deepStrictEqual([...switches.overrides], [[0, true]]);
  });

  test('held parts stay as they are drawn through a change of what hides them', () => {
    const switches = createPartSwitches();

    switches.setModel('a');
    switches.setHidden([true, false]);
    switches.hold();
    switches.setHidden([false, true], true);
    assert.deepStrictEqual([...switches.overrides], [[0, false], [1, true]]);
    switches.setHidden([false, true]);
    assert.deepStrictEqual([...switches.overrides], [[0, false], [1, true]]);
  });

  test('an edit keeps the state picked by hand, found again by what it is', () => {
    const before = [toState('DefaultModelConditionState'), toState('ModelConditionState = DAMAGED')];
    const after = [
      toState('DefaultModelConditionState'),
      toState('ModelConditionState = SNOW'),
      toState('ModelConditionState = DAMAGED'),
    ];

    assert.strictEqual(findRedrawnState(before, before[1], after), 2);
  });

  test('a picked state whose conditions were edited stays picked at its place', () => {
    const before = [toState('DefaultModelConditionState'), toState('ModelConditionState = DAMAGED')];
    const edited = [toState('DefaultModelConditionState'), toState('ModelConditionState = REALLYDAMAGED')];
    const moved = [toState('DefaultModelConditionState'), toState('ModelConditionState = X', 'ModuleTag_Other')];

    assert.strictEqual(findRedrawnState(before, before[1], edited), 1);
    assert.strictEqual(findRedrawnState(before, before[1], moved), undefined);
  });

  test('of two like states the second picked stays the second', () => {
    const before = [toState('ModelConditionState = DAMAGED'), toState('ModelConditionState = DAMAGED')];
    const after = [toState('DefaultModelConditionState'), ...before.map((state) => ({ ...state }))];

    assert.strictEqual(findRedrawnState(before, before[1], after), 2);
  });

  test('a ticked checkbox leaves the viewer its letters and keeps Space to tick itself', () => {
    const keys = ['b', 'r', '.', ' '];

    assert.deepStrictEqual(
      keys.map((key) => isFieldKey('INPUT', 'checkbox', key)),
      [false, false, false, true],
    );
    assert.deepStrictEqual(
      keys.map((key) => isFieldKey('INPUT', 'search', key)),
      [true, true, true, true],
    );
    assert.deepStrictEqual(
      [isFieldKey('INPUT', 'number', 'r'), isFieldKey('SELECT', undefined, 'b'), isFieldKey('BUTTON', undefined, ' ')],
      [true, true, false],
    );
  });
});
