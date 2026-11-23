import * as assert from 'assert';
import {
  MAX_ENTRY_PATH_LENGTH,
  findPathClashes,
  getMoveRefusal,
  toArchiveFileName,
  validateEntryName,
  validateEntryPath,
} from '../../core/entryName';

suite('Entry names', () => {
  test('accepts ordinary names, any casing, Latin-1 letters and names that only start like a device', () => {
    for (const name of ['a.ini', 'Data', 'My Mod.ini', 'a.b.c', 'café.tga', '.hidden', 'console.ini', 'com10']) {
      assert.strictEqual(validateEntryName(name), undefined, name);
    }
  });

  test('refuses names Windows or the entry table cannot hold', () => {
    const refused = [
      ...['', '   ', '\t', '.', '..', 'a.', ' a.ini', 'a.ini '],
      ...['a/b', 'a\\b', '/a'],
      ...[...'<>:"|?*\u0001'].map((char) => `a${char}b`),
      ...['CON', 'nul', 'Aux.txt', 'com1', 'LPT9.ini', 'prn.big'],
      ...['€.ini', '日本.ini', 'a\u0085b', 'a\u{1f600}'],
    ];

    for (const name of refused) {
      assert.ok(validateEntryName(name), JSON.stringify(name));
    }
  });

  test('checks every segment of a path and both separators', () => {
    assert.strictEqual(validateEntryPath('data/ini/object.ini'), undefined);
    assert.strictEqual(validateEntryPath('data\\ini\\object.ini'), undefined);
    assert.ok(validateEntryPath('data/../object.ini'));
    assert.ok(validateEntryPath('data//object.ini'));
    assert.ok(validateEntryPath('/data/object.ini'));
    assert.ok(validateEntryPath('data/object.ini/'));
    assert.ok(validateEntryPath('data/con/object.ini'));
    assert.ok(validateEntryPath('data/ object.ini'));
    assert.ok(validateEntryPath(''));
  });

  test('refuses an overlong path and accepts one at the limit', () => {
    const atLimit = `${'a/'.repeat((MAX_ENTRY_PATH_LENGTH - 1) / 2)}a`;

    assert.strictEqual(atLimit.length, MAX_ENTRY_PATH_LENGTH);
    assert.strictEqual(validateEntryPath(atLimit), undefined);
    assert.ok(validateEntryPath(`${atLimit}b`));
  });

  test('turns a typed archive name into a .big file name', () => {
    assert.deepStrictEqual(toArchiveFileName(' mod '), { name: 'mod.big' });
    assert.deepStrictEqual(toArchiveFileName('mod.BIG'), { name: 'mod.BIG' });
    assert.ok('error' in toArchiveFileName(''));
    assert.ok('error' in toArchiveFileName('.big'));
    assert.ok('error' in toArchiveFileName('a/b'));
    assert.ok('error' in toArchiveFileName('con'));
    assert.ok('error' in toArchiveFileName('a:b'));
  });
});

suite('Path clashes', () => {
  test('reports a path repeated, ignoring case', () => {
    assert.deepStrictEqual(findPathClashes(['a/b.ini', 'A/B.INI']), [
      { index: 1, path: 'A/B.INI', reason: 'The same path is added twice.' },
    ]);
  });

  test('reports a file and a folder claiming one path, among the paths added or against an existing file', () => {
    for (const paths of [['a', 'a/b.ini'], ['a/b.ini', 'a'], ['A', 'a/b.ini']]) {
      assert.strictEqual(findPathClashes(paths).length, 1, paths.join(' '));
    }
    assert.strictEqual(findPathClashes(['a/b.ini'], ['A']).length, 1);
    assert.deepStrictEqual(findPathClashes(['a'], ['a']), []);
    assert.deepStrictEqual(findPathClashes(['a/b.ini', 'a/c.ini', 'ab/b.ini', 'a/d/e.ini']), []);
  });
});

suite('Move refusals', () => {
  test('refuses a move onto itself, into its own child or into the folder it is in', () => {
    const refusals: [string, string, string | undefined][] = [
      ['a/b', 'a/b', 'itself'],
      ['a/b', 'A/B', 'itself'],
      ['a/b', 'a/b/c', 'inside'],
      ['a', 'a/b/c', 'inside'],
      ['a/b.ini', 'a', 'sameFolder'],
      ['b.ini', '', 'sameFolder'],
      ['a', '', 'sameFolder'],
      ['a/b.ini', '', undefined],
      ['a', 'ab', undefined],
      ['a/b', 'c', undefined],
    ];

    for (const [from, into, refusal] of refusals) {
      assert.strictEqual(getMoveRefusal(from, into), refusal, `${from} into ${into}`);
    }
  });
});
