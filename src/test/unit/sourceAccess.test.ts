import * as assert from 'assert';
import { isInReadOnlySource } from '../../services/archives/sourceAccess';

const baseSource = { label: 'Base game: bfme2', external: true };
const workspaceSource = { label: 'my-mod', external: false };

suite('source access', () => {
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
