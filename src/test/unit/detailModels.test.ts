import * as assert from 'assert';
import { findDetailFiles, getDetailModel } from '../../game/objects/detailModels';

suite('Detail models', () => {
  const rigs = new Map([
    ['tu_skn.w3d', 'TU_SKL'],
    ['tu_sknm.w3d', 'TU_SKL'],
    ['tu_sknl.w3d', 'TU_SKL'],
    ['tu_stool.w3d', 'TU_STOOL'],
    ['tu_stoo.w3d', 'TU_OTHER'],
  ]);
  const read = async (file: string) => rigs.get(file);

  test('a level names the file beside the model', () => {
    assert.strictEqual(getDetailModel('TU_SKN', 'low'), 'TU_SKNL');
    assert.strictEqual(getDetailModel('TU_SKN.w3d', 'medium'), 'TU_SKNM');
    assert.strictEqual(getDetailModel('TU_SKN', 'high'), 'TU_SKN');
  });

  test('the files are found from whichever level is open', async () => {
    const files = { high: 'tu_skn.w3d', medium: 'tu_sknm.w3d', low: 'tu_sknl.w3d' };

    assert.deepStrictEqual(await findDetailFiles('TU_SKN.w3d', read), { level: 'high', files });
    assert.deepStrictEqual(await findDetailFiles('tu_sknl.w3d', read), { level: 'low', files });
  });

  test('a name that only ends in L is no level of another skeleton', async () => {
    assert.strictEqual(await findDetailFiles('tu_stool.w3d', read), undefined);
    assert.strictEqual(await findDetailFiles('absent.w3d', read), undefined);
  });
});
