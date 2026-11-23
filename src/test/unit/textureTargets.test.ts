import * as assert from 'assert';
import { decodeDds, decodeTga } from '../../formats/texture/textureTools';
import {
  TEXTURE_TARGETS,
  encodeTexture,
  getOutputName,
  getTargetExtension,
  hasPowerOfTwoSides,
} from '../../formats/texture/textureTargets';

const image = { width: 8, height: 4, pixels: new Uint8Array(8 * 4 * 4).fill(200) };

suite('Texture targets', () => {
  test('every format offered encodes an image the texture readers read back at its size', () => {
    for (const { target } of TEXTURE_TARGETS) {
      const bytes = encodeTexture(image, target, true);
      const decoded = getTargetExtension(target) === 'dds' ? decodeDds(bytes) : decodeTga(bytes);

      assert.deepStrictEqual([decoded.levels[0].width, decoded.levels[0].height], [8, 4], target);
    }
  });

  test('offers only the kinds the retail archives hold', () => {
    assert.deepStrictEqual(
      TEXTURE_TARGETS.map(({ target }) => target),
      ['tga32', 'tga24', 'DXT1', 'DXT5'],
    );
  });

  test('mipmaps are a DDS choice, and a TGA keeps one level', () => {
    assert.strictEqual(decodeDds(encodeTexture(image, 'DXT5', true)).levels.length > 1, true);
    assert.strictEqual(decodeDds(encodeTexture(image, 'DXT5', false)).levels.length, 1);
    assert.strictEqual(decodeTga(encodeTexture(image, 'tga24', true)).hasAlpha, false);
  });

  test('a converted file keeps its name with the format’s extension', () => {
    assert.deepStrictEqual(
      [getOutputName('banner.photo.jpeg', 'dds'), getOutputName('icon', 'tga')],
      ['banner.photo.dds', 'icon.tga'],
    );
    assert.deepStrictEqual(
      [hasPowerOfTwoSides({ width: 256, height: 64 }), hasPowerOfTwoSides({ width: 300, height: 64 })],
      [true, false],
    );
  });
});
