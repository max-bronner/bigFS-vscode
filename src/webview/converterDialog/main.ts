import type {
  ConverterDialogContent,
  ConverterReview,
  FromConverterDialog,
  ToConverterDialog,
} from '../../core/converterDialog';
import { element } from '../shared/element';
import { getVsCodeApi } from '../shared/vscodeApi';
import { createForm } from './createForm';
import type { ConverterForm } from './createForm';

const MAX_SIDE = 8192;

const vscode = getVsCodeApi<FromConverterDialog>();

let form: ConverterForm | undefined;
const messages = element('div', undefined, 'messages');
const convertButton = element('button', 'Convert');
const cancelButton = element('button', 'Cancel', 'secondary');
const progress = element('div', undefined, 'progress');
const progressText = element('div');
const progressBar = element('progress');
const done = element('div', undefined, 'done');
const log = element('div', undefined, 'log');
let hasErrors = false;
let isRunning = false;

progress.hidden = true;
progress.append(progressText, progressBar, done, log);

const showReview = ({ errors, warnings, notes, hidden }: ConverterReview) => {
  hasErrors = errors.length > 0;
  messages.replaceChildren(
    ...errors.map((text) => element('div', text, 'message error')),
    ...warnings.map((text) => element('div', text, 'message warning')),
    ...notes.map((text) => element('div', text, 'message note')),
  );
  form?.setHidden(hidden);
  convertButton.disabled = hasErrors || isRunning;
};

const setRunning = (running: boolean) => {
  isRunning = running;
  form?.setDisabled(running);
  convertButton.disabled = running || hasErrors;
  cancelButton.textContent = running ? 'Stop' : 'Close';
};

const show = (content: ConverterDialogContent) => {
  const files = element('ul', undefined, 'files');

  files.append(
    ...content.files.map(({ name, detail }) => {
      const row = element('li');

      row.append(element('span', name), element('span', detail ?? '', 'detail'));
      return row;
    }),
  );
  form = createForm(content.fields, content.values, (values) =>
    vscode.postMessage({ kind: 'change', values }),
  );

  const actions = element('div', undefined, 'actions');

  actions.append(convertButton, cancelButton);
  document.body.replaceChildren(
    element('h2', content.heading),
    element('p', content.about, 'about'),
    element('h3', content.files.length === 1 ? '1 file' : `${content.files.length} files`),
    files,
    ...(content.skipped.length
      ? [element('p', `Skipped: ${content.skipped.join('; ')}`, 'skipped')]
      : []),
    ...(content.fields.length ? [element('h3', 'Options'), form.element] : []),
    messages,
    actions,
    progress,
  );
  showReview(content.review);
};

convertButton.onclick = () => {
  if (form) {
    vscode.postMessage({ kind: 'convert', values: { ...form.values } });
  }
};
cancelButton.onclick = () => vscode.postMessage({ kind: 'cancel' });

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

window.addEventListener('message', ({ data }: MessageEvent<ToConverterDialog>) => {
  switch (data.kind) {
    case 'show':
      show(data);
      break;
    case 'review':
      showReview(data.review);
      break;
    case 'started':
      progress.hidden = false;
      progressText.textContent = 'Starting…';
      progressBar.removeAttribute('value');
      progressBar.hidden = false;
      done.textContent = '';
      log.replaceChildren();
      setRunning(true);
      break;
    case 'progress':
      progressText.textContent = data.text;
      if (data.fraction === undefined) {
        progressBar.removeAttribute('value');
      } else {
        progressBar.value = data.fraction;
      }
      break;
    case 'log':
      log.append(element('div', data.text, data.isError ? 'error' : undefined));
      break;
    case 'finished':
      progressText.textContent = '';
      progressBar.hidden = true;
      done.textContent = data.text;
      setRunning(false);
      break;
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
  }
});

vscode.postMessage({ kind: 'ready' });
