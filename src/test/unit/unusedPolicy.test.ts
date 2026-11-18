import * as assert from 'assert';
import { isModFile, isReportableKind } from '../../game/ini-tools/unusedPolicy';

suite('Unused definition policy', () => {
  test('kinds that maps, scripts or the engine name are never reported', () => {
    for (const kind of [
      'Object',
      'ChildObject',
      'PlayerTemplate',
      'CommandSet',
      'NewEvaEvent',
      'PredefinedEvaEvent',
      'GameData',
      'Upgrade',
      'Science',
      'SpecialPower',
      'AudioEvent',
      'MusicTrack',
      'Video',
      'MouseCursor',
    ]) {
      assert.strictEqual(isReportableKind(kind), false, kind);
    }
    for (const kind of ['Weapon', 'fxlist', 'CommandButton', 'Locomotor']) {
      assert.strictEqual(isReportableKind(kind), true, kind);
    }
  });

  test('only files of the mod count, never a base game folder', () => {
    const workspace = ['/work/mod'];

    assert.strictEqual(
      isModFile('/work/mod/data/ini/a.ini', workspace, []),
      true,
    );
    assert.strictEqual(isModFile('/elsewhere/a.ini', workspace, []), false);
    assert.strictEqual(
      isModFile('/work/mod/Game/data/a.ini', workspace, ['/work/mod/game']),
      false,
    );
    assert.strictEqual(
      isModFile('/work/mod/a.ini', workspace, ['/work/mod/']),
      false,
    );
    assert.strictEqual(isModFile('/work/mod2/a.ini', workspace, []), false);
    assert.strictEqual(
      isModFile('C:\\Mod\\Data\\a.ini', ['c:\\mod'], ['D:\\Game']),
      true,
    );
  });
});
