import * as assert from 'assert';
import { createToolRegistry } from '../../core/toolRegistry';
import { buildW3dScene } from '../../formats/w3d/w3dScene';
import { buildChunk, concatBytes, encodeFloats, encodeName, encodeUints } from './w3dSynth';

const toTga = (blue: number) =>
  Buffer.from([0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 32, 0x28, blue, 2, 3, 255]);

suite('Texture swaps', () => {
  const model = (() => {
    const header = new Uint8Array(116);

    header.set(encodeName('BODY', 16), 8);
    header.set(encodeName('UNIT', 16), 24);

    return buildChunk(
      0,
      concatBytes(
        buildChunk(0x1f, header),
        buildChunk(2, encodeFloats(0, 0, 0, 1, 0, 0, 0, 1, 0)),
        buildChunk(0x20, concatBytes(encodeUints(0, 1, 2, 0), encodeFloats(0, 0, 1, 0))),
        buildChunk(0x30, buildChunk(0x31, buildChunk(0x32, encodeName('Plain.tga', 10)), true), true),
        buildChunk(
          0x38,
          buildChunk(
            0x48,
            concatBytes(buildChunk(0x49, encodeUints(0)), buildChunk(0x4a, encodeFloats(0, 0, 1, 0, 0, 1))),
            true,
          ),
          true,
        ),
      ),
      true,
    );
  })();
  const layers = [[{ from: 'Plain.tga', to: 'Snow.tga' }]];

  test('a replacement is read once, to draw it', async () => {
    const reads: string[] = [];
    const scene = await buildW3dScene(
      model,
      async (name) => {
        reads.push(name.toLowerCase());
        return name.toLowerCase() === 'snow.tga' ? toTga(5) : undefined;
      },
      createToolRegistry(),
      undefined,
      layers,
    );

    assert.deepStrictEqual(scene.textureNames, ['Plain.tga']);
    assert.strictEqual(scene.textures.length, 1);
    assert.strictEqual(reads.filter((name) => name === 'snow.tga').length, 1);
  });

  test('with a way to find files, the swap reads nothing to choose', async () => {
    const reads: string[] = [];
    const asked: string[] = [];

    await buildW3dScene(
      model,
      async (name) => {
        reads.push(name.toLowerCase());
        return name.toLowerCase() === 'snow.tga' ? toTga(5) : undefined;
      },
      createToolRegistry(),
      undefined,
      layers,
      async (name) => {
        asked.push(name);
        return name === 'snow.tga';
      },
    );

    assert.deepStrictEqual(asked, ['snow.dds', 'snow.tga']);
    assert.deepStrictEqual(reads.filter((name) => name.startsWith('snow')), ['snow.dds', 'snow.tga']);
  });
});
