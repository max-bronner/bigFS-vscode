import * as assert from 'assert';
import { assignConverterFiles } from '../../core/assignConverterFiles';
import type { GivenConverterFile } from '../../core/assignConverterFiles';

const NONE_LISTED = { image: [], cursor: [], video: [], strings: [] };

const give = (path: string, folder?: string): GivenConverterFile<string> => ({
  file: path,
  name: path.slice(path.lastIndexOf('/') + 1),
  key: `file:///${path}`,
  folder,
});

suite('Converter file assignment', () => {
  test('files dropped on a converter are those it takes, the rest skipped by name', () => {
    const { added, skipped } = assignConverterFiles(
      [give('intro.MP4'), give('notes.txt'), give('frame.png'), give('table.str')],
      NONE_LISTED,
      'video',
    );

    assert.deepStrictEqual([...added], [['video', ['intro.MP4', 'frame.png']]]);
    assert.deepStrictEqual(skipped, ['notes.txt', 'table.str']);
  });

  test('a folder adds the matching files inside it and counts the others', () => {
    const { added, skipped } = assignConverterFiles(
      [give('frames/a.txt', 'frames'), give('frames/1.tga', 'frames'), give('frames/2.wav', 'frames')],
      NONE_LISTED,
      'video',
    );

    assert.deepStrictEqual(added.get('video'), ['frames/1.tga']);
    assert.deepStrictEqual(skipped, ['2 other files in frames']);
  });

  test('a file already listed or given twice is added once', () => {
    const { added, duplicates } = assignConverterFiles(
      [give('a.str'), give('b.csf'), give('b.csf')],
      { ...NONE_LISTED, strings: ['file:///a.str'] },
      'strings',
    );

    assert.deepStrictEqual(added.get('strings'), ['b.csf']);
    assert.strictEqual(duplicates, 2);
  });

  test('a drop on empty space puts each file under the one converter that takes it', () => {
    const { added, skipped } = assignConverterFiles(
      [give('wall.jpg'), give('intro.mp4'), give('menu.csf'), give('frame.png'), give('notes.txt')],
      NONE_LISTED,
    );

    assert.deepStrictEqual(Object.fromEntries(added), {
      image: ['wall.jpg'],
      video: ['intro.mp4'],
      strings: ['menu.csf'],
    });
    assert.deepStrictEqual(skipped, ['frame.png (more than one converter takes it)', 'notes.txt']);
  });
});
