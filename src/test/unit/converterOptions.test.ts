import * as assert from 'assert';
import { partitionByExtension } from '../../core/partitionByExtension';
import {
  createVp6Fields,
  getDefaultVp6Values,
  resolveMovieSize,
  reviewVp6Values,
} from '../../features/video/vp6Options';

const HD = { width: 1920, height: 1080, fps: 30 };

suite('Converter options', () => {
  test('the VP6 size starts at the source fitted to the retail width, and presets are grouped by aspect ratio', () => {
    const values = getDefaultVp6Values(HD, 2);
    const size = createVp6Fields(HD, 1).find((field) => field.id === 'size')!;

    assert.strictEqual(values.size, 'fit');
    assert.deepStrictEqual(resolveMovieSize(values.size, 0, 0, HD), { width: 1024, height: 576 });
    assert.deepStrictEqual(resolveMovieSize('640x480', 0, 0, HD), { width: 640, height: 480 });
    assert.deepStrictEqual(resolveMovieSize('source', 0, 0, HD), { width: 1920, height: 1080 });
    assert.ok(size.kind === 'select');
    assert.deepStrictEqual(
      [...new Set(size.options.map(({ group }) => group))],
      ['From the source', '16:9', '4:3', '16:10', 'Other'],
    );
    assert.ok(size.options.some(({ value, group }) => value === '854x480' && group === '16:9'));
  });

  test('a VP6 width over the retail limit is a warning, over VP6\'s own a refusal', () => {
    const review = (size: string, width = 0) =>
      reviewVp6Values({ ...getDefaultVp6Values(HD, 2), size, width, height: 720 }, [HD]);

    assert.deepStrictEqual(review('1024x576').warnings, []);
    assert.match(review('1280x720').warnings.join(), /up to 1024 pixels wide, so the game may crash/);
    assert.deepStrictEqual(review('1280x720').errors, []);
    assert.match(review('custom', 4082).errors.join(), /1 to 4080/);
  });

  test('an odd custom VP6 width is rounded up to even, with a note', () => {
    assert.deepStrictEqual(resolveMovieSize('custom', 853, 480, HD), { width: 854, height: 480, oddWidth: 853 });
    assert.match(
      reviewVp6Values({ ...getDefaultVp6Values(HD, 2), size: 'custom', width: 853, height: 480 }, [HD]).notes.join(),
      /853 is rounded up to 854/,
    );
  });

  test('dropped files are split into those a converter takes and the rest, in order', () => {
    const { accepted, skipped } = partitionByExtension(
      ['b.PNG', 'notes.txt', 'a.png', 'png', 'archive.big'],
      (name) => name,
      ['png'],
    );

    assert.deepStrictEqual(accepted, ['b.PNG', 'a.png']);
    assert.deepStrictEqual(skipped, ['notes.txt', 'png', 'archive.big']);
  });
});
