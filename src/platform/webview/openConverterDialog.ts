import * as vscode from 'vscode';
import type {
  ConverterDialogContent,
  ConverterReview,
  ConverterValues,
  FromConverterDialog,
  ToConverterDialog,
} from '../../core/converterDialog';
import { describeError } from '../../core/errors';
import { getPageBundleFolder, getPageBundleOptions } from './pageBundle';
import { renderWebviewPage } from './webviewPage';

const MAX_DECODED_SIDE = 8192;

export interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface ConversionRun {
  log(text: string, isError?: boolean): void;
  progress(text: string, fraction?: number): void;
  isCancelled(): boolean;
  decodeImage(bytes: Uint8Array): Promise<DecodedImage>;
}

export interface ConverterDialogSpec extends Omit<ConverterDialogContent, 'review'> {
  title: string;
  review(values: ConverterValues): ConverterReview;
  convert(values: ConverterValues, run: ConversionRun): Promise<string>;
  dispose?(): void;
}

const STYLE = `
  body { max-width: 760px; padding: 8px 20px 24px; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  h2 { margin: 8px 0 4px; font-size: 1.3em; font-weight: 600; }
  h3 { margin: 18px 0 6px; font-size: 1em; font-weight: 600; }
  .about { margin: 0 0 8px; opacity: 0.85; }
  .files { margin: 0; padding: 0; list-style: none; max-height: 12em; overflow: auto; border: 1px solid var(--vscode-panel-border, #8884); }
  .files li { padding: 3px 8px; display: flex; gap: 12px; }
  .files li:nth-child(odd) { background: var(--vscode-list-hoverBackground, #8881); }
  .files .detail { opacity: 0.75; margin-left: auto; white-space: nowrap; }
  .skipped { margin: 6px 0 0; opacity: 0.8; }
  .field { display: grid; grid-template-columns: 11em minmax(0, 26em); align-items: center; gap: 8px; margin: 6px 0; }
  .field .control { display: flex; align-items: center; gap: 6px; }
  .field .unit { opacity: 0.75; }
  .field.checkbox { grid-template-columns: auto 1fr; }
  select, input[type=number] { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, transparent); padding: 3px 4px; font: inherit; }
  input[type=number] { color: var(--vscode-input-foreground); background: var(--vscode-input-background); border-color: var(--vscode-input-border, transparent); width: 8em; }
  .messages { margin: 14px 0 0; }
  .message { padding: 6px 10px; margin: 4px 0; border-left: 3px solid; }
  .message.error { border-color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground, #f003); }
  .message.warning { border-color: var(--vscode-editorWarning-foreground, #cca700); background: var(--vscode-inputValidation-warningBackground, #cca70022); }
  .message.note { border-color: var(--vscode-textLink-foreground, #3794ff); opacity: 0.9; }
  .actions { display: flex; gap: 8px; margin-top: 16px; }
  button { padding: 4px 14px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; cursor: pointer; font: inherit; }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:disabled { opacity: 0.5; cursor: default; }
  .progress { margin-top: 14px; }
  .progress progress { width: 100%; }
  .log { margin-top: 8px; font-size: 0.95em; }
  .log div { padding: 1px 0; }
  .log .error { color: var(--vscode-errorForeground); }
  .done { margin-top: 8px; font-weight: 600; }
  [hidden] { display: none !important; }
`;

const runConverter = async (
  spec: ConverterDialogSpec,
  given: ConverterValues,
): Promise<void> => {
  const values = { ...spec.values, ...given };
  const { errors } = spec.review(values);
  const failures: string[] = [...errors];

  try {
    if (!errors.length) {
      await spec.convert(values, {
        log: (text, isError) => isError && failures.push(text),
        progress: () => undefined,
        isCancelled: () => false,
        decodeImage: () => Promise.reject(new Error('Only the dialog decodes this kind of image')),
      });
    }
  } finally {
    spec.dispose?.();
  }
  if (failures.length) {
    throw new Error(failures.join('\n'));
  }
};

export const openConverterDialog = async (
  extensionUri: vscode.Uri,
  spec: ConverterDialogSpec,
  values?: ConverterValues,
): Promise<void> => {
  if (values) {
    await runConverter(spec, values);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'bigfs.converterDialog',
    spec.title,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [getPageBundleFolder(extensionUri)],
    },
  );
  const decoding = new Map<
    number,
    { resolve(image: DecodedImage): void; reject(error: Error): void }
  >();
  let nextId = 1;
  let isRunning = false;
  let isCancelled = false;
  let isClosed = false;

  const post = (message: ToConverterDialog) => {
    if (!isClosed) {
      void panel.webview.postMessage(message);
    }
  };
  const run: ConversionRun = {
    log: (text, isError) => post({ kind: 'log', text, isError }),
    progress: (text, fraction) => post({ kind: 'progress', text, fraction }),
    isCancelled: () => isCancelled || isClosed,
    decodeImage: (bytes) =>
      new Promise((resolve, reject) => {
        if (isClosed) {
          reject(new Error('The dialog was closed'));
          return;
        }

        const id = nextId++;

        decoding.set(id, { resolve, reject });
        post({ kind: 'decode', id, bytes: new Uint8Array(bytes) });
      }),
  };

  const convert = async (values: ConverterValues) => {
    const review = spec.review(values);

    if (review.errors.length || isRunning) {
      post({ kind: 'review', review });
      return;
    }
    isRunning = true;
    isCancelled = false;
    post({ kind: 'started' });

    let text: string;

    try {
      text = await spec.convert(values, run);
    } catch (error) {
      run.log(describeError(error), true);
      text = 'Stopped by an error';
    }
    isRunning = false;
    post({ kind: 'finished', text: isCancelled ? 'Cancelled' : text });
  };

  panel.webview.onDidReceiveMessage((message: FromConverterDialog) => {
    switch (message.kind) {
      case 'ready':
        post({
          kind: 'show',
          heading: spec.heading,
          about: spec.about,
          files: spec.files,
          skipped: spec.skipped,
          fields: spec.fields,
          values: spec.values,
          review: spec.review(spec.values),
        });
        break;
      case 'change':
        post({ kind: 'review', review: spec.review(message.values) });
        break;
      case 'convert':
        void convert(message.values);
        break;
      case 'cancel':
        if (isRunning) {
          isCancelled = true;
        } else {
          panel.dispose();
        }
        break;
      case 'decoded': {
        const waiting = decoding.get(message.id);
        const width = Number(message.width);
        const height = Number(message.height);
        const pixels = new Uint8Array(message.pixels);

        decoding.delete(message.id);
        if (
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          width < 1 ||
          height < 1 ||
          width > MAX_DECODED_SIDE ||
          height > MAX_DECODED_SIDE ||
          pixels.length !== width * height * 4
        ) {
          waiting?.reject(new Error('The page sent an image that does not hold together'));
        } else {
          waiting?.resolve({ width, height, pixels });
        }
        break;
      }
      case 'decodeFailed':
        decoding.get(message.id)?.reject(new Error(`Cannot read it as an image: ${message.message}`));
        decoding.delete(message.id);
        break;
    }
  });
  panel.onDidDispose(() => {
    isClosed = true;
    for (const waiting of decoding.values()) {
      waiting.reject(new Error('The dialog was closed'));
    }
    decoding.clear();
    spec.dispose?.();
  });
  panel.webview.html = renderWebviewPage({
    style: STYLE,
    body: '',
    ...getPageBundleOptions(extensionUri, panel.webview, 'converterDialog'),
  });
};
