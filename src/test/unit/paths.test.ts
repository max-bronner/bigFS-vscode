import * as assert from 'assert';
import {
  getAvailableName,
  isContainedPath,
  isDiskPathBelow,
  isPathBelow,
  movePath,
} from '../../core/paths';

suite('Path helpers', () => {
  test('isPathBelow matches the path itself and its descendants only', () => {
    assert.ok(isPathBelow('data/a.ini', 'data/a.ini'));
    assert.ok(isPathBelow('data/sub/a.ini', 'data'));
    assert.ok(!isPathBelow('database/a.ini', 'data'));
    assert.ok(!isPathBelow('data', 'data/sub'));
  });

  test('movePath repoints a path below a new parent', () => {
    assert.strictEqual(
      movePath('data/a.ini', 'data/a.ini', 'art/b.ini'),
      'art/b.ini',
    );
    assert.strictEqual(
      movePath('data/sub/a.ini', 'data', 'art'),
      'art/sub/a.ini',
    );
  });

  test('getAvailableName appends numbered copy suffixes', () => {
    const takenNames = new Set(['a.ini', 'a copy.ini', 'a copy 2.ini']);

    assert.strictEqual(getAvailableName(takenNames, 'b.ini'), 'b.ini');
    assert.strictEqual(getAvailableName(takenNames, 'a.ini'), 'a copy 3.ini');
    assert.strictEqual(
      getAvailableName(new Set(['plain']), 'plain'),
      'plain copy',
    );
  });

  test('getAvailableName compares names case insensitively', () => {
    const takenNames = new Set(['File.ini']);

    assert.strictEqual(
      getAvailableName(takenNames, 'file.ini'),
      'file copy.ini',
    );

    assert.strictEqual(
      getAvailableName(takenNames, 'FILE.INI'),
      'FILE copy.INI',
    );
  });

  test('isContainedPath refuses paths that escape the extraction target', () => {
    assert.ok(isContainedPath('data/ini/object.ini'));
    assert.ok(isContainedPath('art\\w3d\\unit.w3d'));
    assert.ok(!isContainedPath('../outside.txt'));
    assert.ok(!isContainedPath('data\\..\\..\\outside.txt'));
    assert.ok(!isContainedPath('/etc/passwd'));
    assert.ok(!isContainedPath('\\windows\\system.ini'));
    assert.ok(!isContainedPath('C:\\windows\\system.ini'));
    assert.ok(!isContainedPath(''));
  });

  test('isDiskPathBelow accepts either separator and ignores case only when asked', () => {
    assert.ok(isDiskPathBelow('C:\\Games\\BFME2\\a.tga', 'C:/Games/BFME2/', false));
    assert.ok(isDiskPathBelow('C:\\Games\\BFME2', 'C:\\Games\\BFME2', false));
    assert.ok(!isDiskPathBelow('C:\\Games\\BFME2x\\a.tga', 'C:\\Games\\BFME2', false));
    assert.ok(!isDiskPathBelow('c:\\games\\bfme2\\a.tga', 'C:\\Games\\BFME2', false));
    assert.ok(isDiskPathBelow('c:\\games\\bfme2\\a.tga', 'C:\\Games\\BFME2', true));
  });
});
