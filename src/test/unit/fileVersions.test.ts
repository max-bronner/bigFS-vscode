import * as assert from 'assert';
import { describeFileVersion, getSideTitle } from '../../game/install/describeFileVersion';
import { listFileVersions } from '../../game/install/listFileVersions';
import type { StackCandidates, VersionLayer } from '../../game/install/listFileVersions';

const MOD: VersionLayer = { label: 'TestMod', kind: 'mod', base: false };
const ROTWK: VersionLayer = { label: 'Base game: rotwk', kind: 'rotwk', base: true };
const BFME2: VersionLayer = { label: 'Base game: bfme2', kind: 'bfme2', base: true };

const copy = (key: string, layer: VersionLayer, archive?: string) => ({
  ref: key,
  key,
  archive,
  layer,
});

const MOD_STACK: StackCandidates<string> = {
  top: MOD,
  copies: [
    copy('mod', MOD, '____TestMod.big'),
    copy('rotwk', ROTWK, 'INI.big'),
    copy('bfme2', BFME2, 'INI.big'),
  ],
};

suite('Other versions of a file', () => {
  test('every layer\'s copy is offered in load order, the open file left out and the winner first', () => {
    const { open, others } = listFileVersions([MOD_STACK], 'rotwk');

    assert.deepStrictEqual(
      others.map(({ key, place }) => [key, place]),
      [
        ['mod', 1],
        ['bfme2', 3],
      ],
    );
    assert.strictEqual(open?.place, 2);
  });

  test('the retail original is the first retail copy, never the open file or a mod\'s', () => {
    assert.strictEqual(listFileVersions([MOD_STACK], 'mod').retail?.key, 'rotwk');
    assert.strictEqual(listFileVersions([MOD_STACK], 'rotwk').retail, undefined);
  });

  test('another game\'s stack adds only the copies the open file\'s lacks, at their place there', () => {
    const bfme2Stack = { top: BFME2, copies: [copy('bfme2', BFME2, 'INI.big')] };
    const rotwkStack = {
      top: ROTWK,
      copies: [copy('rotwk', ROTWK, 'INI.big'), copy('bfme2', BFME2, 'INI.big')],
    };
    const { open, others } = listFileVersions([bfme2Stack, rotwkStack], 'bfme2');

    assert.strictEqual(open?.isOtherStack, false);
    assert.deepStrictEqual(
      others.map(({ key, place, isOtherStack }) => [key, place, isOtherStack]),
      [['rotwk', 1, true]],
    );
  });

  test('a label names the archive or folder, the game or mod and the place, and a title both', () => {
    const { others, retail } = listFileVersions(
      [
        {
          top: MOD,
          copies: [copy('loose', MOD), ...MOD_STACK.copies.slice(1)],
        },
        { top: ROTWK, copies: [copy('other', ROTWK, 'patch.big')] },
      ],
      'none',
    );
    const described = others.map((version) =>
      describeFileVersion(version, { isRetailOriginal: version === retail, size: 2048 }),
    );

    assert.deepStrictEqual(
      described.map(({ label, description }) => [label, description]),
      [
        ['TestMod folder', 'mod · wins'],
        ['INI.big', 'ROTWK · 2nd in load order · retail original'],
        ['INI.big', 'BFME II · 3rd in load order'],
        ['patch.big', 'ROTWK · wins in ROTWK'],
      ],
    );
    assert.strictEqual(described[1].detail, 'Base game: rotwk · 2.0 KB');
    assert.strictEqual(
      `${getSideTitle('commandset.ini', others[1])} ↔ ${getSideTitle('commandset.ini', copy('', MOD, '____TestMod.big'))}`,
      'commandset.ini (INI.big · ROTWK) ↔ commandset.ini (____TestMod.big · mod)',
    );
  });
});
