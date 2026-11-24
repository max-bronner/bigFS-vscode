import * as vscode from 'vscode';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import type { ConverterValues } from '../../core/converterDialog';
import { CONVERTER_FILE_TYPES } from '../../core/converterFileTypes';
import { describeError } from '../../core/errors';
import { decodePng } from '../../node/png';
import { Vp6Movie } from '../../formats/vp6/container';
import { encodeMovie, resizeRgba } from '../../formats/vp6/encodeMovie';
import type { FrameSource } from '../../formats/vp6/encodeMovie';
import { describeAspectRatio } from '../../formats/vp6/movieSizes';
import { collectConverterFiles } from '../../platform/collectConverterFiles';
import { registerCommand } from '../../platform/commands';
import { reopenWith } from '../../platform/reopenWith';
import { resolveOutputUris } from '../../platform/resolveOutputUris';
import { settings } from '../../platform/settings';
import { openConverterDialog } from '../../platform/webview/openConverterDialog';
import { renderWebviewPage } from '../../platform/webview/webviewPage';
import { createFfmpegFrameSource, probe, runProcess } from '../../node/ffmpeg';
import { decodeDds, decodeTga } from '../../formats/texture/textureTools';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { toUris } from '../../services/archives/commandTarget';
import type { FromVideoPage, ToVideoPage } from '../../webview/video/protocol';
import {
  createVp6Fields,
  getDefaultVp6Values,
  resolveMovieSize,
  reviewVp6Values,
} from './vp6Options';
import type { MovieSourceSize } from './vp6Options';

const IMAGE = /\.(png|tga|dds)$/i;
const BROWSER_VIDEO = /\.(webm|ogv|ogg|mp4|m4v|mov)$/i;

const decodeImage = (name: string, bytes: Uint8Array) =>
  /\.png$/i.test(name)
    ? decodePng(bytes)
    : (/\.dds$/i.test(name) ? decodeDds(bytes) : decodeTga(bytes)).levels[0];

const getFileName = (uri: vscode.Uri) => path.posix.basename(uri.path);

const findFfmpeg = async (): Promise<string | undefined> => {
  const configured = settings.ffmpegPath.get();

  for (const candidate of [configured, 'ffmpeg'].filter(Boolean) as string[]) {
    try {
      if ((await runProcess(candidate, ['-version'])).code === 0) {
        return candidate;
      }
    } catch {
    }
  }
  return undefined;
};

class BrowserFrames {
  private readonly panel: vscode.WebviewPanel;
  private readonly pending = new Map<
    number,
    { resolve: (data: Uint8Array) => void; reject: (error: Error) => void }
  >();
  private nextRequest = 0;
  private isDisposed = false;
  public readonly meta: Promise<{
    width: number;
    height: number;
    duration: number;
  }>;

  public constructor(file: vscode.Uri, extensionUri: vscode.Uri) {
    const folder = vscode.Uri.joinPath(file, '..');
    const scripts = vscode.Uri.joinPath(extensionUri, 'dist', 'webview');

    this.panel = vscode.window.createWebviewPanel(
      'bigfs.videoFrames',
      `Reading ${path.basename(file.path)}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [folder, scripts] },
    );

    let failed: (error: Error) => void = () => {};

    this.meta = new Promise((resolve, reject) => {
      failed = reject;
      this.panel.webview.onDidReceiveMessage((message: FromVideoPage) => {
        if (message.kind === 'meta') {
          resolve(message);
        } else if (message.kind === 'error') {
          reject(new Error(message.message));
        } else if (message.kind === 'frame') {
          this.pending.get(message.index)?.resolve(new Uint8Array(message.data));
          this.pending.delete(message.index);
        }
      });
    });
    this.panel.onDidDispose(() => {
      const closed = new Error('The reading panel was closed');

      this.isDisposed = true;
      failed(closed);
      this.pending.forEach(({ reject }) => reject(closed));
      this.pending.clear();
    });
    this.panel.webview.html = renderBrowserPage(
      this.panel.webview.asWebviewUri(file),
      this.panel.webview,
      scripts,
    );
  }

  public readFrame(time: number, width: number, height: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      if (this.isDisposed) {
        reject(new Error('The reading panel was closed'));
        return;
      }

      const index = this.nextRequest++;
      const request: ToVideoPage = { kind: 'frame', index, time, width, height };

      this.pending.set(index, { resolve, reject });
      void this.panel.webview.postMessage(request);
    });
  }

  public dispose(): void {
    this.panel.dispose();
  }
}

const renderBrowserPage = (
  video: vscode.Uri,
  webview: vscode.Webview,
  scripts: vscode.Uri,
): string =>
  renderWebviewPage({
    allow: { media: webview.cspSource, script: webview.cspSource },
    scriptFiles: [
      webview.asWebviewUri(vscode.Uri.joinPath(scripts, 'video.js')).toString(),
    ],
    style: `body { color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); padding: 10px; } canvas { max-width: 100%; }`,
    body: `<div id="status">Reading frames…</div>
<video id="video" src="${video}" muted preload="auto" hidden></video>
<canvas id="canvas"></canvas>`,
  });

const toRateFraction = (fps: number): [number, number] => {
  const whole = Math.round(fps * 1.001);

  return !Number.isInteger(fps) && Math.abs((whole * 1000) / 1001 - fps) < 0.01
    ? [whole * 1000, 1001]
    : [Math.round(fps * 1000), 1000];
};

interface FrameReader {
  next: FrameSource['next'];
  stop?: () => void;
}

interface MovieSource extends MovieSourceSize {
  name: string;
  input: vscode.Uri;
  outputName: string;
  reader: string;
  open(width: number, height: number, rate: number): FrameReader;
}

const createSequence = (
  name: string,
  input: vscode.Uri,
  files: vscode.Uri[],
  first: { width: number; height: number },
): MovieSource => ({
  name,
  input,
  outputName: `${name.replace(/\.[^.]*$/, '')}.vp6`,
  reader: files.length === 1 ? 'one image' : `${files.length} frames`,
  width: first.width,
  height: first.height,
  fps: 30,
  open: (width, height) => {
    let index = 0;

    return {
      next: async () => {
        const file = files[index++];

        if (!file) {
          return undefined;
        }

        const image = decodeImage(file.path, await vscode.workspace.fs.readFile(file));

        return resizeRgba(image.pixels, image.width, image.height, width, height);
      },
    };
  },
});

const sortNumerically = (files: vscode.Uri[]) =>
  [...files].sort((a, b) => getFileName(a).localeCompare(getFileName(b), undefined, { numeric: true }));

const readSources = async (
  inputs: readonly vscode.Uri[],
  extensionUri: vscode.Uri,
  cleanups: (() => unknown)[],
): Promise<{ sources: MovieSource[]; skipped: string[] }> => {
  const sources: MovieSource[] = [];
  const skipped: string[] = [];
  const images: vscode.Uri[] = [];
  let ffmpeg: string | undefined | null = null;

  for (const input of inputs) {
    const name = getFileName(input);

    try {
      const isFolder = ((await vscode.workspace.fs.stat(input)).type & vscode.FileType.Directory) !== 0;

      if (IMAGE.test(name) && !isFolder) {
        images.push(input);
        continue;
      }
      if (isFolder) {
        const files = sortNumerically(
          (await vscode.workspace.fs.readDirectory(input))
            .filter(([file, type]) => type === vscode.FileType.File && IMAGE.test(file))
            .map(([file]) => vscode.Uri.joinPath(input, file)),
        );

        if (!files.length) {
          throw new Error('the folder holds no PNG, TGA or DDS frames');
        }
        sources.push(
          createSequence(name, input, files, decodeImage(files[0].path, await vscode.workspace.fs.readFile(files[0]))),
        );
        continue;
      }

      let file = input;

      if (input.scheme !== 'file') {
        const folder = await mkdtemp(path.join(os.tmpdir(), 'bigfs-video-'));
        const copy = path.join(folder, name);

        cleanups.push(() => rm(folder, { recursive: true, force: true }));
        await writeFile(copy, await vscode.workspace.fs.readFile(input));
        file = vscode.Uri.file(copy);
      }
      if (ffmpeg === null) {
        ffmpeg = await findFfmpeg();
      }

      const found = ffmpeg;

      if (found) {
        sources.push({
          name,
          input,
          outputName: name.replace(/\.[^.]*$/, '.vp6'),
          reader: 'FFmpeg',
          ...(await probe(found, file.fsPath)),
          open: (width, height, rate) => createFfmpegFrameSource(found, file.fsPath, width, height, rate),
        });
        continue;
      }
      if (!BROWSER_VIDEO.test(name)) {
        throw new Error(`reading ${path.extname(name)} needs FFmpeg; install it or set ${settings.ffmpegPath.key}`);
      }

      const browser = new BrowserFrames(file, extensionUri);

      cleanups.push(() => browser.dispose());

      const meta = await browser.meta;

      sources.push({
        name,
        input,
        outputName: name.replace(/\.[^.]*$/, '.vp6'),
        reader: "VS Code's browser engine, at 30 fps unless set",
        width: meta.width,
        height: meta.height,
        fps: 30,
        open: (width, height, rate) => {
          const count = Math.max(1, Math.floor(meta.duration * rate));
          let index = 0;

          return {
            next: async () =>
              index < count ? browser.readFrame(index++ / rate + 0.5 / rate, width, height) : undefined,
          };
        },
      });
    } catch (error) {
      skipped.push(`${name} (${describeError(error)})`);
    }
  }

  if (images.length) {
    const frames = sortNumerically(images);

    try {
      sources.unshift(
        createSequence(
          getFileName(frames[0]),
          frames[0],
          frames,
          decodeImage(frames[0].path, await vscode.workspace.fs.readFile(frames[0])),
        ),
      );
    } catch (error) {
      skipped.push(`${getFileName(frames[0])} (${describeError(error)})`);
    }
  }
  return { sources, skipped };
};

const hasTransparency = (rgba: Uint8Array) => {
  for (let at = 3; at < rgba.length; at += 4) {
    if (rgba[at] < 255) {
      return true;
    }
  }
  return false;
};

const encodeSource = async (
  source: MovieSource,
  values: ConverterValues,
  report: (text: string) => void,
  isCancelled: () => boolean,
): Promise<{ bytes: Uint8Array; summary: string } | undefined> => {
  const size = resolveMovieSize(values.size, values.width, values.height, source);
  const rate = Number(values.fps);
  const keySeconds = Number(values.keySeconds);
  const game = source.open(size.width, size.height, rate);

  try {
    const first = await game.next();

    if (!first) {
      throw new Error('The source has no frames');
    }

    const alpha = hasTransparency(first);
    let pending: Uint8Array | undefined = first;
    const [rateNumerator, rateDenominator] = toRateFraction(rate);
    const bytes = await encodeMovie(
      {
        width: size.width,
        height: size.height,
        rateNumerator,
        rateDenominator,
        alpha,
        next: async () => {
          const frame = pending ?? (await game.next());

          pending = undefined;
          return frame;
        },
      },
      {
        quality: Number(values.quality),
        keyInterval: keySeconds > 0 ? Math.max(1, Math.round(keySeconds * rate)) : 1,
        cancelled: isCancelled,
        progress: (frames) => report(`${source.name}: ${frames} frames`),
      },
    );

    if (!bytes) {
      return undefined;
    }

    const movie = new Vp6Movie(bytes);

    for (const index of [0, movie.frameCount >> 1, movie.frameCount - 1]) {
      movie.decodeFrame(index);
    }
    return {
      bytes,
      summary: [
        `${movie.frameCount} frames, ${size.width}×${size.height}`,
        ...(alpha ? ['with alpha'] : []),
        `${(bytes.length / 1024).toFixed(0)} KB`,
      ].join(', '),
    };
  } finally {
    game.stop?.();
  }
};

const convertToVp6 = async (
  extensionUri: vscode.Uri,
  archives: ArchiveModel,
  target: unknown,
  selection: unknown,
  values?: ConverterValues,
): Promise<void> => {
  const files = await collectConverterFiles(toUris(target, selection), {
    ...CONVERTER_FILE_TYPES.video,
    canSelectFolders: true,
  });

  if (!files) {
    return;
  }

  const cleanups: (() => unknown)[] = [];
  const release = () => cleanups.forEach((cleanup) => void Promise.resolve(cleanup()).catch(() => undefined));
  let read: Awaited<ReturnType<typeof readSources>>;

  try {
    read = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Reading the videos' },
      () => readSources(files.accepted, extensionUri, cleanups),
    );
  } catch (error) {
    release();
    throw error;
  }

  const { sources } = read;
  const skipped = [...files.skipped, ...read.skipped];

  if (!sources.length) {
    release();
    throw new Error(`Nothing to convert: ${skipped.join('; ')}`);
  }

  const canWriteBeside = (uri: vscode.Uri) => uri.scheme === 'file' && !archives.isReadOnlyUri(uri);

  await openConverterDialog(
    extensionUri,
    {
      title: 'Convert to VP6 Movie',
      heading: 'Convert to VP6 movies',
      about: 'Each video, folder of numbered frames, or the images chosen together as frames, becomes a VP6 movie. Transparency in the first frame is kept as an alpha stream.',
      files: sources.map((source) => ({
        name: source.name,
        detail: `${source.width}×${source.height}, ${describeAspectRatio(source.width, source.height)}, ${Math.round(source.fps * 100) / 100} fps, ${source.reader}`,
      })),
      skipped,
      fields: createVp6Fields(sources[0], sources.length),
      values: getDefaultVp6Values(sources[0], settings.vp6KeyFrameSeconds.get()),
      review: (given) => reviewVp6Values(given, sources),
      convert: async (given, run) => {
        const outputs = await resolveOutputUris(
          sources.map(({ input }) => input),
          sources.map(({ outputName }) => outputName),
          given.output,
          canWriteBeside,
        );

        if (!outputs) {
          return 'Nothing written';
        }

        let written = 0;
        let last: vscode.Uri | undefined;

        for (const [at, source] of sources.entries()) {
          if (run.isCancelled()) {
            break;
          }
          try {
            const result = await encodeSource(
              source,
              given,
              (text) => run.progress(text, at / sources.length),
              run.isCancelled,
            );

            if (!result) {
              break;
            }
            await vscode.workspace.fs.writeFile(outputs[at], result.bytes);
            written++;
            last = outputs[at];
            run.log(`${source.name} → ${getFileName(outputs[at])}: ${result.summary}`);
          } catch (error) {
            run.log(`${source.name}: ${describeError(error)}`, true);
          }
        }
        if (last) {
          await reopenWith(last, 'bigfs.preview', vscode.ViewColumn.Beside);
        }
        return `${written} of ${sources.length} converted`;
      },
      dispose: release,
    },
    values,
  );
};

export const registerVideoCommands = (context: vscode.ExtensionContext, archives: ArchiveModel): void => {
  context.subscriptions.push(
    registerCommand('bigfs.convertToVp6', (target?: unknown, selection?: unknown, values?: ConverterValues) =>
      convertToVp6(context.extensionUri, archives, target, selection, values),
    ),
  );
};
