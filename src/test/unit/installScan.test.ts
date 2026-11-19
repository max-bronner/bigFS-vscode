import * as assert from 'assert';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { findArchives } from '../../node/installScan';

suite('Archive discovery', () => {
  let directory: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'bigfs-'));
  });

  teardown(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test('finds archives in nested folders, whatever the extension casing', async () => {
    await mkdir(path.join(directory, 'sub'));
    await writeFile(path.join(directory, 'a.big'), '');
    await writeFile(path.join(directory, 'sub', 'B.BIG'), '');
    await writeFile(path.join(directory, 'sub', 'c.txt'), '');

    const found = (await findArchives(directory)).sort();

    assert.deepStrictEqual(found, [
      path.join(directory, 'a.big'),
      path.join(directory, 'sub', 'B.BIG'),
    ]);
  });

  test('a folder that cannot be read holds nothing instead of failing the scan', async () => {
    assert.deepStrictEqual(
      await findArchives(path.join(directory, 'missing')),
      [],
    );
  });
});
