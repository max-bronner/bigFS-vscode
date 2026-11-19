import * as assert from 'assert';
import {
  ReadOnlySourceError,
  assertWritableSource,
  isInReadOnlySource,
  isReadOnlySource,
} from '../../services/archives/sourceAccess';

const baseSource = { label: 'Base game: bfme2', external: true };
const workspaceSource = { label: 'my-mod', external: false };

suite('source access', () => {
  test('a base game outside the workspace is read-only', () => {
    assert.strictEqual(isReadOnlySource(baseSource), true);
  });

  test('a folder of the workspace stays writable', () => {
    assert.strictEqual(isReadOnlySource(workspaceSource), false);
  });

  test('a write, delete or rename into the base game is rejected before it reaches an archive', () => {
    assert.throws(
      () => assertWritableSource(baseSource),
      (error: unknown) =>
        error instanceof ReadOnlySourceError &&
        error.message.includes('Base game: bfme2 is read-only'),
    );
  });

  test('a workspace source accepts the same writes', () => {
    assert.doesNotThrow(() => assertWritableSource(workspaceSource));
  });

  test('a loose file below a read-only source is read-only, one below a workspace source is not', () => {
    const sources = [
      { ...baseSource, baseUri: { scheme: 'file', fsPath: 'C:\\Games\\BFME2' } },
      { ...workspaceSource, baseUri: { scheme: 'file', fsPath: 'C:\\Work\\mod' } },
    ];

    assert.ok(isInReadOnlySource(sources, 'C:\\Games\\BFME2\\data\\a.tga'));
    assert.ok(!isInReadOnlySource(sources, 'C:\\Games\\BFME2 copy\\a.tga'));
    assert.ok(!isInReadOnlySource(sources, 'C:\\Work\\mod\\a.tga'));
  });

  test('casing counts only where the disk ignores it', () => {
    const sources = [
      { ...baseSource, baseUri: { scheme: 'file', fsPath: 'C:\\Games\\BFME2' } },
    ];

    assert.ok(isInReadOnlySource(sources, 'c:\\games\\bfme2\\Data\\a.tga', true));
    assert.ok(!isInReadOnlySource(sources, 'c:\\games\\bfme2\\Data\\a.tga', false));
  });
});
