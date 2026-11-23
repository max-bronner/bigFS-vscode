import * as assert from 'assert';
import type { RelatedModel } from '../../game/objects/findRelatedModels';
import { layOutRelatedList } from '../../webview/preview/createRelatedPicker';
import type { RelatedLine } from '../../webview/preview/createRelatedPicker';
import { getWavePeaks } from '../../webview/preview/getWavePeaks';

const toText = (line: RelatedLine): string =>
  line.kind === 'heading'
    ? `# ${line.text}`
    : line.kind === 'more'
      ? `+ ${line.hidden} more ${line.group}`
      : `${line.isPicked ? '[' : ''}${line.name}${line.detail ? ` · ${line.detail}` : ''}${line.isPicked ? ']' : ''}`;

const related = (file: string, kind: RelatedModel['kind'], state?: string): RelatedModel => ({
  file,
  kind,
  uses: state ? [{ object: 'SampleBarracks', state }] : [],
});

const buildWav = (samples: number[], channels: number): Uint8Array => {
  const list = Buffer.from('LIST\x04\x00\x00\x00INFO', 'latin1');
  const fmt = Buffer.alloc(24);
  const data = Buffer.alloc(8 + samples.length * 2);

  fmt.write('fmt ', 0, 'latin1');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(8000, 12);
  fmt.writeUInt32LE(8000 * channels * 2, 16);
  fmt.writeUInt16LE(channels * 2, 20);
  fmt.writeUInt16LE(16, 22);
  data.write('data', 0, 'latin1');
  data.writeUInt32LE(samples.length * 2, 4);
  samples.forEach((sample, at) => data.writeInt16LE(sample, 8 + at * 2));

  const body = Buffer.concat([Buffer.from('WAVE', 'latin1'), fmt, list, data]);
  const header = Buffer.alloc(8);

  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  return new Uint8Array(Buffer.concat([header, body]));
};

suite('Preview side panels', () => {
  test('the related list starts on the opened file, then each kind under a heading with its count', () => {
    const lines = layOutRelatedList(
      'sample_skn.w3d',
      [
        related('sample_skl.w3d', 'skeleton'),
        related('sample_d1.w3d', 'model', 'ModelConditionState = DAMAGED'),
        related('sample_idla.w3d', 'animation', 'AnimationState = IDLE'),
        related('sample_snow.w3d', 'model', 'DefaultModelConditionState'),
      ],
      undefined,
      new Set(),
    );

    assert.deepStrictEqual(lines.map(toText), [
      '[sample_skn · this file]',
      '# Models (2)',
      'sample_d1 · SampleBarracks: DAMAGED',
      'sample_snow · SampleBarracks: DefaultModelConditionState',
      '# Skeleton (1)',
      'sample_skl',
      '# Animations (1)',
      'sample_idla · SampleBarracks: IDLE',
    ]);
  });

  test('the file picked is marked in place of the opened one', () => {
    const lines = layOutRelatedList(
      'sample_skn.w3d',
      [related('sample_d1.w3d', 'model'), related('sample_d2.w3d', 'model')],
      'sample_d2.w3d',
      new Set(),
    );

    assert.deepStrictEqual(lines.map(toText), [
      'sample_skn · this file',
      '# Models (2)',
      'sample_d1',
      '[sample_d2]',
    ]);
  });

  test('a long group is cut short with a line to list it whole, unless opened or the pick is in the part cut', () => {
    const clips = Array.from({ length: 14 }, (_, at) =>
      related(`clip${String(at).padStart(2, '0')}.w3d`, 'animation'),
    );
    const cut = layOutRelatedList('sample_skn.w3d', clips, undefined, new Set());
    const opened = layOutRelatedList('sample_skn.w3d', clips, undefined, new Set(['animation']));
    const pickedLate = layOutRelatedList('sample_skn.w3d', clips, 'clip12.w3d', new Set());

    assert.strictEqual(cut.length, 1 + 1 + 10 + 1);
    assert.deepStrictEqual(cut.at(-1), { kind: 'more', group: 'animation', hidden: 4 });
    assert.strictEqual(opened.length, 1 + 1 + 14);
    assert.strictEqual(pickedLate.length, 1 + 1 + 14);
    assert.ok(pickedLate.some((line) => line.kind === 'file' && line.isPicked && line.name === 'clip12'));
  });

  test('the waveform gives each column the lowest and highest sample over every channel', () => {
    const wav = buildWav([0, 16384, -32768, 0, 8192, -8192, 32767, 0], 2);
    const peaks = Array.from(getWavePeaks(wav, 2, 2));

    assert.deepStrictEqual(
      peaks.map((value) => Math.round(value * 100) / 100),
      [-1, 0.5, -0.25, 1],
    );
  });

  test('more columns than frames repeat the frame under them, and a file without data draws nothing', () => {
    const wav = buildWav([16384, -16384], 1);

    assert.deepStrictEqual(Array.from(getWavePeaks(wav, 1, 4)), [0, 0.5, 0, 0.5, -0.5, 0, -0.5, 0]);
    assert.strictEqual(getWavePeaks(new Uint8Array(wav.subarray(0, 40)), 1, 4).length, 0);
    assert.strictEqual(getWavePeaks(Uint8Array.from([1, 2, 3]), 1, 4).length, 0);
  });
});
