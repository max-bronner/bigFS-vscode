import type { SageToken, SageStatement } from './sageIniParser';
import type { SageIniSchema } from './sageIniSchema';

export const COLOR_CHANNEL_MAX = 255;

export interface SageColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface ColorChannel {
  key: 'R' | 'G' | 'B' | 'A';
  text: string;
  start: number;
  end: number;
}

export interface ColorValue {
  color: SageColor;
  channels: ColorChannel[];
  start: number;
  end: number;
}

const CHANNEL_TAG = /^([RGBA]):(.*)$/i;

const NUMBER_PREFIX = /^[+-]?(?:\d+\.?\d*|\.\d+)/;

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

const readChannel = (channels: ColorChannel[], key: ColorChannel['key']) => {
  const channel = channels.find((found) => found.key === key);

  return channel
    ? clamp(Number(channel.text), 0, COLOR_CHANNEL_MAX) / COLOR_CHANNEL_MAX
    : undefined;
};

export const parseColorValue = (
  values: readonly SageToken[],
): ColorValue | undefined => {
  const channels: ColorChannel[] = [];

  for (let index = 0; index < values.length; index++) {
    const tag = CHANNEL_TAG.exec(values[index].text);

    if (!tag) {
      break;
    }

    let text = tag[2];
    let start = values[index].start + 2;

    if (!text) {
      const next = values[index + 1];

      if (!next) {
        return undefined;
      }
      text = next.text;
      start = next.start;
      index++;
    }

    const number = NUMBER_PREFIX.exec(text)?.[0];
    const key = tag[1].toUpperCase() as ColorChannel['key'];

    if (!number || channels.some((channel) => channel.key === key)) {
      return undefined;
    }
    channels.push({ key, text: number, start, end: start + number.length });
  }

  const red = readChannel(channels, 'R');
  const green = readChannel(channels, 'G');
  const blue = readChannel(channels, 'B');

  if (red === undefined || green === undefined || blue === undefined) {
    return undefined;
  }

  return {
    color: { red, green, blue, alpha: readChannel(channels, 'A') ?? 1 },
    channels,
    start: values[0].start,
    end: Math.max(...channels.map((channel) => channel.end)),
  };
};

export const isColorField = (schema: SageIniSchema, keyword: string): boolean =>
  schema.getEngineField(keyword)?.type.split('|').includes('Color') ?? false;

export const findColorValue = (
  statement: SageStatement,
  schema: SageIniSchema,
): ColorValue | undefined =>
  statement.block || !isColorField(schema, statement.keyword.text)
    ? undefined
    : parseColorValue(statement.values);

const formatChannel = (old: string, value: number): string => {
  const scaled = clamp(value, 0, 1) * COLOR_CHANNEL_MAX;
  const point = old.indexOf('.');

  if (point < 0) {
    return String(Math.round(scaled));
  }

  const decimals = old.length - point - 1;

  return decimals ? scaled.toFixed(decimals) : `${Math.round(scaled)}.`;
};

export const formatColorValue = (
  line: string,
  value: ColorValue,
  color: SageColor,
): { start: number; end: number; text: string } => {
  const ordered = [...value.channels].sort((a, b) => a.start - b.start);
  const components: Record<ColorChannel['key'], number> = {
    R: color.red,
    G: color.green,
    B: color.blue,
    A: color.alpha,
  };
  const start = ordered[0].start;
  let text = '';
  let column = start;

  for (const channel of ordered) {
    text += line.slice(column, channel.start);
    text += formatChannel(channel.text, components[channel.key]);
    column = channel.end;
  }

  return { start, end: column, text };
};

const SWATCH_SIZE = 16;

export const formatColorSwatch = ({ color, channels }: ColorValue): string => {
  const hex = formatColorHex(color);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SWATCH_SIZE}" height="${SWATCH_SIZE}">` +
    `<rect x="0.5" y="0.5" width="${SWATCH_SIZE - 1}" height="${SWATCH_SIZE - 1}" ` +
    `fill="${hex.slice(0, 7)}" fill-opacity="${color.alpha}" stroke="#808080"/></svg>`;
  const values = (['R', 'G', 'B', 'A'] as const)
    .filter((key) => key !== 'A' || channels.some((channel) => channel.key === 'A'))
    .map((key) => {
      const component = { R: color.red, G: color.green, B: color.blue, A: color.alpha }[key];

      return `${key} ${+(component * COLOR_CHANNEL_MAX).toFixed(2)}`;
    })
    .join(' · ');

  return `![${hex}](data:image/svg+xml,${encodeURIComponent(svg)}) \`${hex}\` · ${values}`;
};

export const formatColorHex = ({ red, green, blue, alpha }: SageColor): string =>
  `#${[red, green, blue, ...(alpha < 1 ? [alpha] : [])]
    .map((component) =>
      Math.round(clamp(component, 0, 1) * COLOR_CHANNEL_MAX)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
