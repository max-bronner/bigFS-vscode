import * as assert from 'assert';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  getOriginalPath,
  restoreOriginal,
  writeKeepingOriginal,
} from '../../node/originalCopy';

suite('Original copy of asset.dat', () => {
  let directory: string;
  let catalogue: string;

  setup(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'bigfs-'));
    catalogue = path.join(directory, 'asset.dat');
    await writeFile(catalogue, 'first');
  });

  teardown(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const read = (filePath: string) => readFile(filePath, 'utf-8');

  test('keeps the file as it was before writing the new one', async () => {
    assert.strictEqual(await writeKeepingOriginal(catalogue, Buffer.from('synced'), true), 'kept');
    assert.strictEqual(await read(getOriginalPath(catalogue)), 'first');
    assert.strictEqual(await read(catalogue), 'synced');
  });

  test('never replaces an original kept before', async () => {
    await writeKeepingOriginal(catalogue, Buffer.from('synced once'), true);

    assert.strictEqual(
      await writeKeepingOriginal(catalogue, Buffer.from('synced twice'), true),
      'alreadyKept',
    );
    assert.strictEqual(await read(getOriginalPath(catalogue)), 'first');
    assert.strictEqual(await read(catalogue), 'synced twice');
  });

  test('leaves the file alone when its original could not be kept', async () => {
    const failing = () => Promise.reject(new Error('disk full'));

    await assert.rejects(
      writeKeepingOriginal(catalogue, Buffer.from('synced'), true, failing),
      /disk full/,
    );
    assert.strictEqual(await read(catalogue), 'first');
  });

  test('restores the original and keeps it', async () => {
    await writeKeepingOriginal(catalogue, Buffer.from('synced'), true);
    await restoreOriginal(catalogue);

    assert.strictEqual(await read(catalogue), 'first');
    assert.strictEqual(await read(getOriginalPath(catalogue)), 'first');
  });
});
