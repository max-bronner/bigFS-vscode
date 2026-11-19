import * as assert from 'assert';
import { pathsToRevert } from '../../features/apt/aptSnapshot';

suite('apt snapshot', () => {
  test('a path an earlier save wrote and edits dropped is reverted', () => {
    const touched = new Set(['a_geometry/1.ru', 'a.dat']);
    const files = new Map([['a.dat', Uint8Array.of(1)]]);

    assert.deepStrictEqual(pathsToRevert(touched, files), ['a_geometry/1.ru']);
  });

  test('nothing is reverted before a save', () => {
    assert.deepStrictEqual(
      pathsToRevert(new Set(), new Map([['a.dat', Uint8Array.of(1)]])),
      [],
    );
  });
});
