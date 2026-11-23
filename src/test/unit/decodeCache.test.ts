import * as assert from 'assert';
import crypto from 'node:crypto';
import { createToolRegistry } from '../../core/toolRegistry';
import { loadSceneDraws } from '../../formats/w3d/w3dSceneDraws';
import type { W3dMesh } from '../../formats/w3d/w3dTools';
import { createDecodeCache } from '../../node/decodeCache';

const toTga = (blue: number) =>
  Buffer.from([0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 32, 0x28, blue, 2, 3, 255]);

const countHashes = async (run: () => Promise<void> | void): Promise<number> => {
  const original = crypto.createHash;
  let count = 0;

  crypto.createHash = ((algorithm: string, options?: crypto.HashOptions) => {
    count++;
    return original(algorithm, options);
  }) as typeof crypto.createHash;
  try {
    await run();
  } finally {
    crypto.createHash = original;
  }
  return count;
};

suite('Decode cache', () => {
  test('a bump map rebuilt from a kept height map is the same image, so its digest is kept', async () => {
    const cache = createDecodeCache(createToolRegistry(), () => assert.fail('no PNG here'));
    const mesh = {
      draws: [
        {
          pass: 0,
          texture: { name: 'Bumps.tga', clampU: false, clampV: false },
          surface: { bumpOffset: true },
        },
      ],
    } as unknown as W3dMesh;
    const build = async () =>
      (await loadSceneDraws([mesh], async (name) => (name === 'Bumps.tga' ? toTga(9) : undefined), cache.tools))
        .textures[0];
    const first = await build();

    assert.ok(first);
    cache.getDigest(first);
    assert.strictEqual(await build(), first);
    assert.strictEqual(await countHashes(async () => void cache.getDigest(await build())), 1);
  });

  test("a mask's JPEG copied again is hashed only when its bytes change", async () => {
    const cache = createDecodeCache(createToolRegistry(), () => assert.fail('no PNG here'));
    const pixels = Uint8Array.of(1, 2, 3, 4);
    const mask = (jpeg: number[]) => ({ width: 1, height: 1, pixels, luminanceJpeg: Uint8Array.from(jpeg) });
    const first = cache.getDigest(mask([0xff, 0xd8, 1]));

    assert.strictEqual(await countHashes(() => assert.strictEqual(cache.getDigest(mask([0xff, 0xd8, 1])), first)), 0);
    assert.notStrictEqual(cache.getDigest(mask([0xff, 0xd8, 2])), first);
  });
});
