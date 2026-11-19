import * as assert from 'assert';
import { toPlayableAudio } from '../../formats/audio/audioTools';

const buildWave = (
  tag: number,
  channels: number,
  sampleRate: number,
  blockAlign: number,
  bitsPerSample: number,
  data: number[],
): Uint8Array => {
  const bytes = new Uint8Array(44 + data.length);
  const view = new DataView(bytes.buffer);
  const writeTag = (at: number, text: string) =>
    bytes.set(
      Array.from(text, (c) => c.charCodeAt(0)),
      at,
    );

  writeTag(0, 'RIFF');
  view.setUint32(4, 36 + data.length, true);
  writeTag(8, 'WAVE');
  writeTag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, tag, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeTag(36, 'data');
  view.setUint32(40, data.length, true);
  bytes.set(data, 44);

  return bytes;
};

const buildExtensible = (
  subFormat: number,
  channels: number,
  blockAlign: number,
  bitsPerSample: number,
  data: number[],
): Uint8Array => {
  const bytes = new Uint8Array(68 + data.length);
  const view = new DataView(bytes.buffer);
  const writeTag = (at: number, text: string) =>
    bytes.set(
      Array.from(text, (c) => c.charCodeAt(0)),
      at,
    );

  writeTag(0, 'RIFF');
  view.setUint32(4, 60 + data.length, true);
  writeTag(8, 'WAVE');
  writeTag(12, 'fmt ');
  view.setUint32(16, 40, true);
  view.setUint16(20, 0xfffe, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, 8000, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint16(36, 22, true);
  view.setUint16(44, subFormat, true);
  writeTag(60, 'data');
  view.setUint32(64, data.length, true);
  bytes.set(data, 68);

  return bytes;
};

const samplesOf = (wav: Uint8Array): number[] => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);

  return Array.from({ length: (wav.length - 44) / 2 }, (_, index) =>
    view.getInt16(44 + index * 2, true),
  );
};

suite('Audio decoding', () => {
  test('PCM read as a Buffer comes back as a fresh array the page can play', () => {
    const bytes = Buffer.from(buildWave(1, 1, 8000, 2, 16, new Array(1600).fill(0)));
    const { wav, info } = toPlayableAudio(bytes);

    assert.ok(!Buffer.isBuffer(wav), 'a Buffer reaches a webview as a plain object');
    assert.strictEqual(wav.constructor, Uint8Array);
    assert.strictEqual(info.format, 'PCM');
    assert.strictEqual(info.durationSeconds, 0.1);
  });

  test('16-bit PCM keeps its samples', () => {
    const { wav, info } = toPlayableAudio(
      buildWave(1, 1, 8000, 2, 16, [0x34, 0x12, 0xff, 0xff]),
    );

    assert.strictEqual(info.bitsPerSample, 16);
    assert.deepStrictEqual(samplesOf(wav), [0x1234, -1]);
  });

  test('8-bit PCM is unsigned around 128', () => {
    const { wav, info } = toPlayableAudio(buildWave(1, 1, 8000, 1, 8, [128, 255, 0]));

    assert.strictEqual(info.bitsPerSample, 8);
    assert.deepStrictEqual(samplesOf(wav), [0, 127 << 8, -32768]);
  });

  test('24-bit and 32-bit PCM keep their top 16 bits', () => {
    const wide24 = toPlayableAudio(buildWave(1, 1, 8000, 3, 24, [0xaa, 0x34, 0x12]));
    const wide32 = toPlayableAudio(
      buildWave(1, 2, 8000, 8, 32, [0, 0, 0x34, 0x12, 0, 0, 0x00, 0x80]),
    );

    assert.deepStrictEqual(samplesOf(wide24.wav), [0x1234]);
    assert.deepStrictEqual(samplesOf(wide32.wav), [0x1234, -32768]);
    assert.strictEqual(wide32.info.channels, 2);
  });

  test('IEEE float scales to 16 bits and clips', () => {
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);

    [0.5, -1, 2].forEach((value, index) => view.setFloat32(index * 4, value, true));
    const { wav, info } = toPlayableAudio(buildWave(3, 1, 8000, 4, 32, [...data]));

    assert.strictEqual(info.format, 'IEEE float');
    assert.deepStrictEqual(samplesOf(wav), [16384, -32767, 32767]);
  });

  test('the extensible header decodes by its sub-format', () => {
    const { wav, info } = toPlayableAudio(buildExtensible(1, 1, 2, 16, [0x34, 0x12]));

    assert.strictEqual(info.format, 'PCM');
    assert.deepStrictEqual(samplesOf(wav), [0x1234]);
  });

  test('a sample width it cannot read is refused by depth', () => {
    assert.throws(
      () => toPlayableAudio(buildWave(3, 1, 8000, 2, 16, [0, 0])),
      /IEEE float of 16 bits is not supported/,
    );
  });

  test('IMA ADPCM decodes to 16-bit PCM, starting from the block header', () => {
    const bytes = buildWave(17, 1, 22050, 8, 4, [100, 0, 0, 0, 0x04, 0, 0, 0]);
    const { wav, info } = toPlayableAudio(bytes);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    const samples = Array.from({ length: 9 }, (_, index) =>
      view.getInt16(44 + index * 2, true),
    );

    assert.strictEqual(info.format, 'IMA ADPCM');
    assert.strictEqual(view.getUint16(20, true), 1, 'rewritten as PCM');
    assert.deepStrictEqual(samples.slice(0, 3), [100, 107, 108]);
  });

  test('a data chunk claiming more than the file holds plays what is there', () => {
    const bytes = buildWave(1, 1, 8000, 2, 16, new Array(80).fill(0));

    new DataView(bytes.buffer).setUint32(40, 1_000_000, true);

    assert.strictEqual(toPlayableAudio(bytes).info.durationSeconds, 0.005);
  });

  test('a codec it does not decode is refused by number', () => {
    assert.throws(
      () => toPlayableAudio(buildWave(85, 2, 44100, 4, 16, [0, 0, 0, 0])),
      /codec 85 is not supported/,
    );
  });
});
