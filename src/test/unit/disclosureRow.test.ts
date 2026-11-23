import * as assert from 'assert';
import { getGroupCheckState } from '../../webview/shared/createDisclosureRow';

suite('Disclosure rows', () => {
  test('a group with every member on is ticked, not mixed', () => {
    assert.deepStrictEqual(getGroupCheckState(6, 6), { checked: true, indeterminate: false });
  });

  test('a group with none on is clear', () => {
    assert.deepStrictEqual(getGroupCheckState(0, 6), { checked: false, indeterminate: false });
  });

  test('a group with some on is mixed and ticked, so a press switches them all off', () => {
    assert.deepStrictEqual(getGroupCheckState(1, 6), { checked: true, indeterminate: true });
    assert.deepStrictEqual(getGroupCheckState(5, 6), { checked: true, indeterminate: true });
  });
});
