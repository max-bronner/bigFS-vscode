import { TEXTURE_TARGETS, isDdsTarget } from '../../formats/texture/textureTargets';
import type { TextureTarget } from '../../formats/texture/textureTargets';
import { element } from '../shared/element';
import { getVsCodeApi } from '../shared/vscodeApi';
import type { ConverterKind, FromConvertersPage, ImageSettings, ToConvertersPage } from './protocol';

const MAX_SIDE = 8192;

const vscode = getVsCodeApi<FromConvertersPage>();

const DEFAULT_SETTINGS: ImageSettings = { target: 'DXT5', mipmaps: true, output: 'beside' };

const readSettings = (kept: unknown): ImageSettings => {
  const read = (kept ?? {}) as Partial<Record<keyof ImageSettings, unknown>>;

  return {
    target: TEXTURE_TARGETS.some(({ target }) => target === read.target)
      ? (read.target as TextureTarget)
      : DEFAULT_SETTINGS.target,
    mipmaps: typeof read.mipmaps === 'boolean' ? read.mipmaps : DEFAULT_SETTINGS.mipmaps,
    output: read.output === 'folder' ? 'folder' : DEFAULT_SETTINGS.output,
  };
};

const settings = readSettings(vscode.getState());
const logs = new Map<ConverterKind, HTMLElement>();

const keepSettings = () => vscode.setState(settings);

const pick = (converter: ConverterKind) => vscode.postMessage({ kind: 'pick', converter, settings });

const createCard = (
  converter: ConverterKind,
  title: string,
  about: string,
  action: string,
  choices: HTMLElement[] = [],
): HTMLElement => {
  const card = element('section', undefined, 'card');
  const button = element('button', action);
  const log = element('div', undefined, 'log');

  button.onclick = () => pick(converter);
  logs.set(converter, log);
  card.append(element('h3', title), element('p', about, 'about'), ...choices, button, log);
  return card;
};

const createChoice = (label: string, control: HTMLElement): HTMLElement => {
  const row = element('label', undefined, 'choice');

  row.append(element('span', label), control);
  return row;
};

const createImageChoices = (): HTMLElement[] => {
  const format = element('select');
  const mipmaps = element('input');
  const output = element('select');
  const mipmapsRow = createChoice('Mipmaps', mipmaps);

  format.append(
    ...TEXTURE_TARGETS.map(({ target, label, description }) => {
      const option = new Option(`${label} (${description})`, target);

      option.selected = target === settings.target;
      return option;
    }),
  );
  mipmaps.type = 'checkbox';
  mipmaps.checked = settings.mipmaps;
  output.append(new Option('Beside each image', 'beside'), new Option('In a folder I choose', 'folder'));
  output.value = settings.output;

  const showMipmaps = () => {
    mipmapsRow.hidden = !isDdsTarget(settings.target);
  };

  format.onchange = () => {
    settings.target = format.value as TextureTarget;
    showMipmaps();
    keepSettings();
  };
  mipmaps.onchange = () => {
    settings.mipmaps = mipmaps.checked;
    keepSettings();
  };
  output.onchange = () => {
    settings.output = output.value === 'folder' ? 'folder' : 'beside';
    keepSettings();
  };
  showMipmaps();
  return [createChoice('Format', format), mipmapsRow, createChoice('Output', output)];
};

const decode = async (bytes: Uint8Array) => {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });

  try {
    if (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE) {
      throw new Error(`${bitmap.width}×${bitmap.height} is larger than ${MAX_SIDE} on a side`);
    }

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;

    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
};

document.body.append(
  createCard(
    'image',
    'Image to game texture',
    'PNG, JPEG, BMP, GIF, WebP, TGA or DDS to the TGA or DDS the game reads. Pick several at once.',
    'Choose images…',
    createImageChoices(),
  ),
  createCard('cursor', 'Cursor', 'A PNG to a .cur cursor, with the pixel that points asked for.', 'Choose a PNG…'),
  createCard('video', 'Movie to VP6', 'A video to the VP6 movie the game plays, through ffmpeg.', 'Choose a video…'),
  createCard('strings', 'String table', 'A .str to .csf, or a .csf to .str.', 'Choose .str or .csf files…'),
);

window.addEventListener('message', ({ data }: MessageEvent<ToConvertersPage>) => {
  switch (data.kind) {
    case 'decode':
      decode(new Uint8Array(data.bytes)).then(
        ({ width, height, data: pixels }) =>
          vscode.postMessage({
            kind: 'decoded',
            id: data.id,
            width,
            height,
            pixels: new Uint8Array(pixels.buffer),
          }),
        (error: unknown) =>
          vscode.postMessage({
            kind: 'decodeFailed',
            id: data.id,
            message: error instanceof Error ? error.message : String(error),
          }),
      );
      break;
    case 'log': {
      const log = logs.get(data.converter);
      const line = element('div', data.text, data.isError ? 'error' : undefined);

      log?.prepend(line);
      break;
    }
  }
});

vscode.postMessage({ kind: 'ready' });
