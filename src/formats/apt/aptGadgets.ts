export type GadgetKind =
  | 'slider'
  | 'checkbox'
  | 'listbox'
  | 'combobox'
  | 'textentry'
  | 'scrollbar'
  | 'progressbar'
  | 'image'
  | 'view3d'
  | 'unknown';

export interface SurfaceVars {
  type?: string;
  load?: string;
  init?: string;
  windowId?: string;
  imageName?: string;
  imageMap?: string;
  mode?: string;
}

export interface GadgetInfo extends SurfaceVars {
  kind: GadgetKind;
  label: string;
}

export interface Binding {
  name: string;
  fallback: string | number | boolean;
}

const NAMES: [GadgetKind, RegExp][] = [
  ['slider', /^(horz|vert)?slider$/],
  ['checkbox', /^checkbox$/],
  ['listbox', /^(scroll)?listbox$/],
  ['combobox', /^combobox$/],
  ['textentry', /^(text|edit)entry$|^editbox$/],
  ['scrollbar', /^(horz|vert)?scrollbar$/],
  ['progressbar', /^progress(bar)?$/],
  ['view3d', /^view3d$/],
  ['image', /^renderimage(disabled)?$|^renderfactionicon$/],
];

const kindOfName = (name: string | undefined): GadgetKind | undefined => {
  const stem = (name ?? '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/\.wnd$/i, '')
    .toLowerCase();

  return NAMES.find(([, pattern]) => pattern.test(stem))?.[0];
};

export const classifySurface = (vars: SurfaceVars): GadgetInfo | undefined => {
  const type = vars.type?.trim();
  const load = vars.load?.trim();
  const image = vars.imageName?.trim() || vars.imageMap?.trim();
  const kind =
    kindOfName(type) ??
    kindOfName(load) ??
    (image ? 'image' : type ? 'unknown' : undefined);

  if (!kind) {
    return undefined;
  }
  return {
    ...vars,
    kind,
    label:
      kind === 'unknown'
        ? `[engine surface: ${type}]`
        : `[${kind}${image && kind === 'image' ? `: ${image}` : ''}]`,
  };
};

export const BINDINGS: Record<GadgetKind, Binding[]> = {
  slider: [
    { name: '_value', fallback: 0 },
    { name: '_min', fallback: 0 },
    { name: '_max', fallback: 100 },
  ],
  checkbox: [{ name: '_checked', fallback: false }],
  listbox: [
    { name: '_selected', fallback: -1 },
    { name: '_items', fallback: '' },
  ],
  combobox: [
    { name: '_selected', fallback: -1 },
    { name: '_items', fallback: '' },
  ],
  textentry: [{ name: '_text', fallback: '' }],
  scrollbar: [
    { name: '_value', fallback: 0 },
    { name: '_min', fallback: 0 },
    { name: '_max', fallback: 100 },
  ],
  progressbar: [
    { name: '_value', fallback: 0 },
    { name: '_max', fallback: 100 },
  ],
  image: [],
  view3d: [
    { name: '_RenderObj', fallback: '' },
    { name: '_AnimMode', fallback: 'MANUAL' },
    { name: '_Frame', fallback: 0 },
  ],
  unknown: [],
};

export const toNumberOr = (value: unknown, fallback: number): number => {
  const n = typeof value === 'string' && !value.trim() ? NaN : Number(value);

  return Number.isFinite(n) ? n : fallback;
};

export const getRange = (min: unknown, max: unknown): [number, number] => {
  const low = toNumberOr(min, 0);
  const high = toNumberOr(max, 100);

  return high < low ? [high, low] : [low, high];
};

export const clamp = (value: number, [low, high]: [number, number]): number =>
  Math.min(high, Math.max(low, value));

export const valueAt = (
  x: number,
  width: number,
  range: [number, number],
): number =>
  width > 0
    ? Math.round(range[0] + clamp(x / width, [0, 1]) * (range[1] - range[0]))
    : range[0];

export const getFillFraction = (value: number, range: [number, number]): number =>
  range[1] > range[0] ? clamp((value - range[0]) / (range[1] - range[0]), [0, 1]) : 0;

export const splitItems = (items: unknown): string[] =>
  typeof items === 'string' && items.length ? items.split('|') : [];

export const DEFAULT_SIZE: Record<GadgetKind, [number, number]> = {
  slider: [120, 16],
  checkbox: [16, 16],
  listbox: [140, 90],
  combobox: [140, 20],
  textentry: [140, 20],
  scrollbar: [16, 90],
  progressbar: [120, 12],
  image: [64, 64],
  view3d: [100, 100],
  unknown: [96, 24],
};
