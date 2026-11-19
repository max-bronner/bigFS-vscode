import { createByteReader, type ByteReader } from '../../core/byteReader';

export type ChannelKind =
  | 'x'
  | 'y'
  | 'z'
  | 'rotation'
  | 'visibility'
  | 'opacity'
  | 'other';

export interface SampledChannel {
  pivot: number;
  kind: ChannelKind;
  type: number;
  values: Float32Array;
  present: Uint8Array;
  steps?: Uint8Array;
}

export interface W3dAnimation {
  name: string;
  hierarchyName: string;
  frameCount: number;
  frameRate: number;
  channels: SampledChannel[];
  playsWholeFrames?: boolean;
}

const CHUNK = {
  ANIMATION: 0x200,
  ANIMATION_HEADER: 0x201,
  ANIMATION_CHANNEL: 0x202,
  BIT_CHANNEL: 0x203,
  COMPRESSED_ANIMATION: 0x280,
  COMPRESSED_ANIMATION_HEADER: 0x281,
  COMPRESSED_ANIMATION_CHANNEL: 0x282,
  COMPRESSED_BIT_CHANNEL: 0x283,
  MOTION_CHANNEL: 0x284,
};

const MAX_FRAMES = 100000;

const toChannelKind = (raw: number): ChannelKind =>
  raw === 0
    ? 'x'
    : raw === 1
      ? 'y'
      : raw === 2
        ? 'z'
        : raw === 6
          ? 'rotation'
          : raw === 15
            ? 'opacity'
            : 'other';

const getChannelWidth = (kind: ChannelKind) => (kind === 'rotation' ? 4 : 1);

const FILTER_TABLE = (() => {
  const table = new Float32Array(256);

  for (let index = 0; index < 16; index++) {
    table[index] = Number(`1e${index - 8}`);
  }

  for (let index = 0; index < 240; index++) {
    table[16 + index] = 1 - Math.sin(((90 * index) / 240) * (Math.PI / 180));
  }

  return table;
})();

const readFloats = (reader: ByteReader, count: number): number[] =>
  Array.from({ length: count }, () => reader.f32());

const readChunks = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: { type: number; payload: Uint8Array }[] = [];

  for (let at = 0; at + 8 <= bytes.length; ) {
    const type = view.getUint32(at, true);
    const size = view.getUint32(at + 4, true) & 0x7fffffff;

    if (at + 8 + size > bytes.length) {
      throw new Error(`W3D chunk 0x${type.toString(16)} runs past its parent`);
    }

    chunks.push({ type, payload: bytes.subarray(at + 8, at + 8 + size) });
    at += 8 + size;
  }

  return chunks;
};

const readName = (bytes: Uint8Array, at: number) => {
  const raw = bytes.subarray(at, at + 16);
  const end = raw.indexOf(0);

  return String.fromCharCode(...(end < 0 ? raw : raw.subarray(0, end)));
};

const createChannel = (
  pivot: number,
  kind: ChannelKind,
  frames: number,
  type = -1,
): SampledChannel => ({
  pivot,
  kind,
  type,
  values: new Float32Array(frames * getChannelWidth(kind)),
  present: new Uint8Array(frames),
});

const setFrameValue = (target: SampledChannel, frame: number, value: number[]) => {
  if (frame >= 0 && frame < target.present.length) {
    target.values.set(value, frame * value.length);
    target.present[frame] = 1;
  }
};

const normaliseQuaternion = (q: number[]): number[] => {
  const length = Math.hypot(...q) || 1;

  return q.map((value) => value / length);
};

export const slerp = (from: number[], to: number[], t: number): number[] => {
  const a = normaliseQuaternion(from);
  let b = normaliseQuaternion(to);
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

  if (dot < 0) {
    b = b.map((value) => -value);
    dot = -dot;
  }
  dot = Math.min(dot, 1);
  if (dot > 0.9995) {
    return normaliseQuaternion(a.map((value, at) => value * (1 - t) + b[at] * t));
  }

  const arc = Math.acos(dot);
  const sinTurned = Math.sin(arc * t);
  const sinArc = Math.sin(arc);
  const fromShare = Math.cos(arc * t) - (dot * sinTurned) / sinArc;
  const toShare = sinTurned / sinArc;

  return a.map((value, at) => value * fromShare + b[at] * toShare);
};

const blend = (a: number[], b: number[], t: number): number[] =>
  a.length === 1 ? [a[0] + (b[0] - a[0]) * t] : slerp(a, b, t);

const getRestValue = (kind: ChannelKind): number[] =>
  kind === 'rotation' ? [0, 0, 0, 1] : kind === 'opacity' ? [1] : [0];

const roundTiesToEven = (value: number): number => {
  const whole = Math.floor(value);
  const rest = value - whole;

  return rest > 0.5 || (rest === 0.5 && whole % 2 === 1) ? whole + 1 : whole;
};

export const sampleChannel = (
  channel: SampledChannel,
  frame: number,
  { frameCount, playsWholeFrames }: Pick<W3dAnimation, 'frameCount' | 'playsWholeFrames'>,
): number[] | undefined => {
  const width = channel.kind === 'rotation' ? 4 : 1;
  const read = (index: number) =>
    channel.present[index]
      ? Array.from(channel.values.subarray(index * width, index * width + width))
      : undefined;

  if (playsWholeFrames) {
    const nearest = roundTiesToEven(frame);

    return read(nearest < frameCount ? nearest : 0);
  }

  const first = Math.max(0, Math.min(frameCount - 1, Math.floor(frame)));
  const next = Math.min(frameCount - 1, first + 1);
  const t = frame - Math.floor(frame);
  const value = read(first);

  if (t === 0 || channel.kind === 'visibility' || channel.steps?.[first]) {
    return value;
  }

  const following = read(next);

  if (!value && !following) {
    return undefined;
  }

  const rest = getRestValue(channel.kind);

  return blend(value ?? rest, following ?? rest, t);
};

const sampleKeys = (
  target: SampledChannel,
  keys: { frame: number; hold: boolean; value: number[] }[],
) => {
  if (!keys.length) {
    return;
  }

  keys.sort((a, b) => a.frame - b.frame);

  const steps = new Uint8Array(target.present.length);

  target.steps = steps;
  for (let frame = 0; frame < target.present.length; frame++) {
    let split = 0;

    while (split < keys.length && keys[split].frame <= frame) {
      split++;
    }

    if (split === 0) {
      setFrameValue(target, frame, keys[0].value);
    } else if (split === keys.length) {
      setFrameValue(target, frame, keys[keys.length - 1].value);
    } else {
      const earlier = keys[split - 1];
      const later = keys[split];
      const span = later.frame - earlier.frame;

      steps[frame] = later.hold ? 1 : 0;
      setFrameValue(
        target,
        frame,
        later.hold || span <= 0
          ? earlier.value
          : blend(earlier.value, later.value, (frame - earlier.frame) / span),
      );
    }
  }
};

const readAdaptiveDelta = (
  reader: ByteReader,
  width: number,
  eightBit: boolean,
  count: number,
): number[][] => {
  const scale = reader.f32();
  const values = [readFloats(reader, width)];
  const blockBytes = eightBit ? 16 : 8;

  for (let block = 0; block * 16 + 1 < count; block++) {
    for (let component = 0; component < width; component++) {
      const step = FILTER_TABLE[reader.u8()] * scale * (eightBit ? 1 / 16 : 1);

      const deltas = reader.bytes(blockBytes);

      for (let index = 0; index < 16; index++) {
        const frame = block * 16 + index + 1;
        let delta: number;

        if (eightBit) {
          delta = deltas[index] - 128;
        } else {
          const byte = deltas[index >> 1];
          const nibble = index & 1 ? byte >> 4 : byte & 15;

          delta = nibble >= 8 ? nibble - 16 : nibble;
        }

        if (frame < count) {
          values[frame] ??= new Array(width).fill(0);
          values[frame][component] =
            values[frame - 1][component] + step * delta;
        }
      }
    }
  }

  return values;
};

const holdLast = (target: SampledChannel, values: number[][]) => {
  for (let frame = 0; frame < target.present.length && values.length; frame++) {
    setFrameValue(target, frame, values[Math.min(frame, values.length - 1)]);
  }
};

const readBits = (
  target: SampledChannel,
  first: number,
  last: number,
  fallback: boolean,
  packed: Uint8Array,
) => {
  for (let frame = 0; frame < target.present.length; frame++) {
    const index = frame - first;
    const visible =
      frame < first || frame > last
        ? fallback
        : ((packed[index >> 3] >> (index & 7)) & 1) === 1;

    setFrameValue(target, frame, [visible ? 1 : 0]);
  }
};

const readChannel = (
  type: number,
  payload: Uint8Array,
  flavor: number,
  frames: number,
): SampledChannel | undefined => {
  const reader = createByteReader(payload, true, {
    describeOverrun: () => 'An animation channel ends early',
  });

  switch (type) {
    case CHUNK.ANIMATION_CHANNEL: {
      const first = reader.u16();
      const last = reader.u16();

      reader.u16();

      const type = reader.u16();
      const kind = toChannelKind(type);
      const pivot = reader.u16();

      reader.u16();

      const target = createChannel(pivot, kind, frames, type);

      for (let frame = first; frame <= last; frame++) {
        setFrameValue(target, frame, readFloats(reader, getChannelWidth(kind)));
      }

      return target;
    }
    case CHUNK.BIT_CHANNEL: {
      const first = reader.u16();
      const last = reader.u16();

      reader.u16();

      const pivot = reader.u16();
      const fallback = reader.u8() !== 0;
      const target = createChannel(pivot, 'visibility', frames);

      readBits(target, first, last, fallback, reader.bytes(Math.max(0, Math.ceil((last - first + 1) / 8))));

      return target;
    }
    case CHUNK.COMPRESSED_ANIMATION_CHANNEL: {
      const count = reader.u32();
      const pivot = reader.u16();

      reader.u8();

      const type = reader.u8();
      const kind = toChannelKind(type);
      const width = getChannelWidth(kind);
      const target = createChannel(pivot, kind, frames, type);

      if (flavor === 1) {
        holdLast(
          target,
          readAdaptiveDelta(reader, width, false, Math.min(count, MAX_FRAMES)),
        );
      } else {
        const keys = [];

        for (let index = 0; index < Math.min(count, MAX_FRAMES); index++) {
          const raw = reader.u32();

          keys.push({
            frame: raw & 0x7fffffff,
            hold: raw >>> 31 === 1,
            value: readFloats(reader, width),
          });
        }

        sampleKeys(target, keys);
      }

      return target;
    }
    case CHUNK.COMPRESSED_BIT_CHANNEL: {
      const count = reader.u32();
      const pivot = reader.u16();

      reader.u8();

      const fallback = reader.u8() !== 0;
      const target = createChannel(pivot, 'visibility', frames);
      const keys: [number, boolean][] = [];

      for (let index = 0; index < Math.min(count, MAX_FRAMES); index++) {
        const raw = reader.u32();

        keys.push([raw & 0x7fffffff, raw >>> 31 === 1]);
      }

      keys.sort((a, b) => a[0] - b[0]);

      for (let frame = 0, key = -1; frame < frames; frame++) {
        while (key + 1 < keys.length && keys[key + 1][0] <= frame) {
          key++;
        }

        setFrameValue(target, frame, [(key < 0 ? fallback : keys[key][1]) ? 1 : 0]);
      }

      return target;
    }
    case CHUNK.MOTION_CHANNEL: {
      reader.u8();

      const deltaType = reader.u8();

      reader.u8();

      const type = reader.u8();
      const kind = toChannelKind(type);
      const width = getChannelWidth(kind);
      const count = reader.u16();
      const pivot = reader.u16();
      const target = createChannel(pivot, kind, frames, type);

      if (deltaType === 0) {
        const times = Array.from({ length: count }, () => reader.u16());

        if (count % 2) {
          reader.u16();
        }

        sampleKeys(
          target,
          times.map((raw) => ({
            frame: raw & 0x7fff,
            hold: raw >>> 15 === 1,
            value: readFloats(reader, width),
          })),
        );
      } else if (deltaType === 1 || deltaType === 2) {
        holdLast(
          target,
          readAdaptiveDelta(reader, width, deltaType === 2, count),
        );
      } else {
        throw new Error(`Motion channel of unknown delta type ${deltaType}`);
      }

      return target;
    }
  }

  return undefined;
};

export const parseW3dAnimations = (bytes: Uint8Array): W3dAnimation[] =>
  readChunks(bytes)
    .filter(
      (chunk) =>
        chunk.type === CHUNK.ANIMATION ||
        chunk.type === CHUNK.COMPRESSED_ANIMATION,
    )
    .flatMap((chunk) => {
      const children = readChunks(chunk.payload);
      const header = children.find(
        (child) =>
          child.type === CHUNK.ANIMATION_HEADER ||
          child.type === CHUNK.COMPRESSED_ANIMATION_HEADER,
      );

      if (!header || header.payload.length < 44) {
        return [];
      }

      const view = new DataView(
        header.payload.buffer,
        header.payload.byteOffset,
        header.payload.byteLength,
      );
      const isCompressed = chunk.type === CHUNK.COMPRESSED_ANIMATION;
      const frameCount = Math.min(view.getUint32(36, true), MAX_FRAMES);
      const frameRate = isCompressed
        ? view.getUint16(40, true)
        : view.getUint32(40, true);
      const flavor = isCompressed ? view.getUint16(42, true) : 0;
      const channels = children.flatMap((child) => {
        const sampled = readChannel(
          child.type,
          child.payload,
          flavor,
          frameCount,
        );

        return sampled ? [sampled] : [];
      });

      return [
        {
          name: readName(header.payload, 4),
          hierarchyName: readName(header.payload, 20),
          frameCount,
          frameRate: frameRate || 30,
          channels,
          playsWholeFrames: !isCompressed,
        },
      ];
    });

export const readAnimationHierarchyName = (
  bytes: Uint8Array,
): string | undefined => {
  const animation = readChunks(bytes).find(
    (chunk) =>
      chunk.type === CHUNK.ANIMATION ||
      chunk.type === CHUNK.COMPRESSED_ANIMATION,
  );
  const header = animation
    ? readChunks(animation.payload).find(
        (child) =>
          child.type === CHUNK.ANIMATION_HEADER ||
          child.type === CHUNK.COMPRESSED_ANIMATION_HEADER,
      )
    : undefined;

  return header && header.payload.length >= 44
    ? readName(header.payload, 20)
    : undefined;
};

export const findAnimation = (
  animations: W3dAnimation[],
  name: string,
): W3dAnimation | undefined => {
  const wanted = name.toLowerCase();
  const clip = wanted.slice(wanted.lastIndexOf('.') + 1);

  return (
    animations.find(
      (each) => `${each.hierarchyName}.${each.name}`.toLowerCase() === wanted,
    ) ??
    animations.find((each) => each.name.toLowerCase() === clip) ??
    animations[0]
  );
};
