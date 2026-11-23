import * as assert from 'assert';
import { isGameArchive } from '../../game/install/gameArchives';

suite('Game archives', () => {
  test("an install's retail archives came with the game, a mod's beside them did not", () => {
    assert.deepStrictEqual(
      ['INI.big', 'Textures3.big', 'apt/MainMenu.big', 'lang/EnglishAudio.big', '___mymod.big', 'apt/sub/x.big', 'mods/INI.big'].map(
        (path) => isGameArchive('rotwk', path),
      ),
      [true, true, true, true, false, false, false],
    );
  });

  test('a folder that is not an install has no game archives', () => {
    assert.strictEqual(isGameArchive('mod', 'INI.big'), false);
  });
});
