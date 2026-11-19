import * as assert from 'assert';
import { computeDecoderDigests } from './decoderFixtures';

const EXPECTED = {
  tga: 'a81907fb66e86215f4938f04fc56efd4b7e4d21d9c71a4f3944a892886287450',
  dds: '58c30cba23aef5b9bd015fb32b1b25df4cbd9fa47d0c7121790781280847dd0a',
  uncompressedDds:
    'ae155faa5503fb7a7822fb36be3bba2b1f586a2d8452c01ba87b8be2f75c0f50',
  png: 'f290531517df4c8ef447ae456ac39e14f825017a1b4d3af71f06d093ec4bc834',
  transform: '2607aa95c0ef371abd028a9ee11a514dd5b2b9897c18cfa4ae8c32b354019f3e',
  dib: 'd295dd8b7ef54460ba1ac128d9e8cc46e7c010b5b5b853215c772356546797a9',
};

suite('Decoder output after the speed rewrites', () => {
  const digests = computeDecoderDigests();

  for (const [name, expected] of Object.entries(EXPECTED)) {
    test(`${name} gives the bytes the earlier implementation gave`, () => {
      assert.strictEqual(digests[name], expected);
    });
  }
});
