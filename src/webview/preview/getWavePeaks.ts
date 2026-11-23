import { readRiffChunks } from '../../formats/cursor/readRiffChunks';

const WAVE_HEADER = 12;

export const getWavePeaks = (
  wav: Uint8Array,
  channels: number,
  columns: number,
): Float32Array => {
  let data: Uint8Array | undefined;

  try {
    data = readRiffChunks(wav, WAVE_HEADER, 'sound').find(({ id }) => id === 'data')?.data;
  } catch {
    return new Float32Array(0);
  }
  if (!data || channels < 1 || columns < 1) {
    return new Float32Array(0);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const frames = Math.floor(data.length / (2 * channels));
  const peaks = new Float32Array(columns * 2);

  for (let column = 0; column < columns; column++) {
    const start = Math.floor((column * frames) / columns);
    const end = Math.max(start + 1, Math.floor(((column + 1) * frames) / columns));
    let low = 0;
    let high = 0;

    for (let frame = start; frame < Math.min(end, frames); frame++) {
      for (let channel = 0; channel < channels; channel++) {
        const sample = view.getInt16((frame * channels + channel) * 2, true) / 32768;

        low = Math.min(low, sample);
        high = Math.max(high, sample);
      }
    }
    peaks[column * 2] = low;
    peaks[column * 2 + 1] = high;
  }
  return peaks;
};
