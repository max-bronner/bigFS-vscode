import type { AnimatedCursor, CursorParseOptions } from './cursorFrame';
import { parseCur } from './parseCur';
import { readRiffChunks } from './readRiffChunks';

const FORM_LENGTH = 12;
const ANIH_LENGTH = 36;
const MAX_FRAMES = 1024;
const DEFAULT_JIFFIES = 6;

const readUint32s = (data: Uint8Array): number[] => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return Array.from({ length: data.length >> 2 }, (_, index) =>
    view.getUint32(index * 4, true),
  );
};

export const parseAni = (
  bytes: Uint8Array,
  options: CursorParseOptions = {},
): AnimatedCursor => {
  const tag = (at: number) =>
    String.fromCharCode(...bytes.subarray(at, at + 4));

  if (bytes.length < FORM_LENGTH || tag(0) !== 'RIFF' || tag(8) !== 'ACON') {
    throw new Error('Not an animated cursor (no RIFF ACON header)');
  }

  let stepCount: number | undefined;
  let defaultJiffies = DEFAULT_JIFFIES;
  let rates: number[] | undefined;
  let sequence: number[] | undefined;
  let frames: AnimatedCursor['frames'] = [];

  for (const { id, data } of readRiffChunks(bytes, FORM_LENGTH, 'ani')) {
    if (id === 'anih') {
      if (data.length < ANIH_LENGTH) {
        throw new Error('The animation header is cut short');
      }

      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

      stepCount = view.getUint32(8, true);
      defaultJiffies = view.getUint32(28, true);
    } else if (id === 'rate') {
      rates = readUint32s(data);
    } else if (id === 'seq ') {
      sequence = readUint32s(data);
    } else if (
      id === 'LIST' &&
      String.fromCharCode(...data.subarray(0, 4)) === 'fram'
    ) {
      frames = readRiffChunks(data, 4, 'ani frames')
        .filter((chunk) => chunk.id === 'icon')
        .map((chunk, index) => {
          if (index >= MAX_FRAMES) {
            throw new Error(
              `The animation holds more than ${MAX_FRAMES} frames`,
            );
          }

          return parseCur(chunk.data, options)[0];
        });
    }
  }

  if (!frames.length) {
    throw new Error('The animation holds no frames');
  }

  const steps = Math.min(stepCount || frames.length, MAX_FRAMES);
  const order =
    sequence && sequence.length >= steps
      ? sequence.slice(0, steps)
      : frames.map((_, index) => index);
  const durations = rates && rates.length >= order.length ? rates : undefined;

  return {
    frames,
    steps: order.map((frame, step) => {
      if (frame >= frames.length) {
        throw new Error(
          `Step ${step + 1} shows frame ${frame + 1} of ${frames.length}`,
        );
      }

      return {
        frame,
        jiffies: Math.max(1, durations?.[step] ?? defaultJiffies),
      };
    }),
  };
};
