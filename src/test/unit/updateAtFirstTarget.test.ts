import * as assert from 'assert';
import { updateAtFirstTarget } from '../../features/explorer/updateAtFirstTarget';

suite('updateAtFirstTarget', () => {
  test('stops at the first target that takes the write', async () => {
    const tried: string[] = [];

    await updateAtFirstTarget(
      async (target: string) => {
        tried.push(target);
      },
      ['workspace', 'global'],
    );

    assert.deepStrictEqual(tried, ['workspace']);
  });

  test('falls back when the workspace folder cannot be written, as a game install cannot', async () => {
    const written: string[] = [];

    await updateAtFirstTarget(
      async (target: string) => {
        if (target === 'workspace') {
          throw new Error("Unable to write file '.vscode/settings.json' (EPERM)");
        }
        written.push(target);
      },
      ['workspace', 'global'],
    );

    assert.deepStrictEqual(written, ['global']);
  });

  test('throws the last failure when no target takes it', async () => {
    await assert.rejects(
      updateAtFirstTarget(
        async (target: string) => {
          throw new Error(`no ${target}`);
        },
        ['workspace', 'global'],
      ),
      /no global/,
    );
  });
});
