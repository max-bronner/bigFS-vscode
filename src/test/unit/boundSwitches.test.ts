import * as assert from 'assert';
import { listOwnChanges, listSwitchChanges } from '../../webview/particles/boundSwitches';

suite('Bound switches', () => {
  test('each checkbox switches only itself: a change giving something is always its own', () => {
    const give = { give: ['Upgrade_Tower'] };

    assert.deepStrictEqual(listOwnChanges([give], [{ take: ['Upgrade_Tower'] }]), [give]);
  });

  test('a shared upgrade stays until the last part bound to it is switched off', () => {
    const tower = { take: ['Upgrade_Tower'] };
    const banner = { take: ['upgrade_banner'] };
    const snow = { release: ['SNOW'] };

    assert.deepStrictEqual(listOwnChanges([tower, banner], [{ take: ['UPGRADE_TOWER'] }]), [banner]);
    assert.deepStrictEqual(listOwnChanges([snow], [{ release: ['snow'] }]), []);
    assert.deepStrictEqual(listOwnChanges([tower, banner], []), [tower, banner]);
  });

  test("a sub-object's checkbox makes the first change that shows it, or every one that holds it shown", () => {
    const switches = [
      { pattern: 'FLAG', show: { give: ['Upgrade_A'] }, hide: { take: ['Upgrade_B'] } },
      { pattern: 'FLAG', show: { give: ['Upgrade_C'] }, hide: { take: ['Upgrade_D'] } },
      { pattern: 'FLAG' },
    ];

    assert.deepStrictEqual(listSwitchChanges(switches, true), [{ give: ['Upgrade_A'] }]);
    assert.deepStrictEqual(listSwitchChanges(switches, false), [
      { take: ['Upgrade_B'] },
      { take: ['Upgrade_D'] },
    ]);
    assert.deepStrictEqual(listSwitchChanges([], true), []);
  });
});
