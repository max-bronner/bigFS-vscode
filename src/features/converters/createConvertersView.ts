import * as vscode from 'vscode';
import type { RgbaImage } from '../../formats/texture/textureTools';
import { getPageBundleFolder } from '../../platform/webview/pageBundle';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type {
  ConverterKind,
  FromConvertersPage,
  ToConvertersPage,
} from '../../webview/converters/protocol';
import { IMAGE_EXTENSIONS, MAX_SIDE, convertImages } from './convertImages';
import { renderConvertersPage } from './renderConvertersPage';

const CONVERTER_COMMANDS: Record<Exclude<ConverterKind, 'image'>, { command: string; filters: Record<string, string[]>; canSelectMany: boolean }> = {
  cursor: { command: 'bigfs.convertPngToCursor', filters: { 'PNG images': ['png'] }, canSelectMany: false },
  video: {
    command: 'bigfs.convertToVp6',
    filters: { Videos: ['mp4', 'm4v', 'mov', 'webm', 'ogv', 'ogg', 'mkv', 'avi', 'wmv', 'mpg', 'mpeg', 'gif'] },
    canSelectMany: false,
  },
  strings: { command: 'bigfs.convertStringTable', filters: { 'String tables': ['str', 'csf'] }, canSelectMany: true },
};

export const createConvertersView = (
  context: vscode.ExtensionContext,
  archives: ArchiveModel,
): vscode.Disposable => {
  let view: vscode.WebviewView | undefined;
  let nextId = 1;
  const decoding = new Map<number, { resolve(image: RgbaImage): void; reject(error: Error): void }>();

  const post = (message: ToConvertersPage) => void view?.webview.postMessage(message);

  const decodeInPage = (name: string, bytes: Uint8Array) =>
    new Promise<RgbaImage>((resolve, reject) => {
      const id = nextId++;

      decoding.set(id, { resolve, reject });
      post({ kind: 'decode', id, name, bytes });
    });

  const pick = async (message: Extract<FromConvertersPage, { kind: 'pick' }>) => {
    const log = (text: string, isError?: boolean) => post({ kind: 'log', converter: message.converter, text, isError });

    try {
      if (message.converter === 'image') {
        const sources = await vscode.window.showOpenDialog({
          canSelectMany: true,
          filters: { Images: IMAGE_EXTENSIONS },
          title: 'Images to convert',
        });

        if (sources?.length) {
          await convertImages(sources, message.settings, archives, decodeInPage, log);
        }
        return;
      }

      const converter = CONVERTER_COMMANDS[message.converter];

      if (!converter) {
        return;
      }

      const sources = await vscode.window.showOpenDialog({
        canSelectMany: converter.canSelectMany,
        filters: converter.filters,
      });

      for (const source of sources ?? []) {
        await vscode.commands.executeCommand(converter.command, source);
        log(`${source.path.slice(source.path.lastIndexOf('/') + 1)}: done`);
      }
    } catch (error) {
      log(error instanceof Error ? error.message : String(error), true);
    }
  };

  const onMessage = (message: FromConvertersPage) => {
    switch (message.kind) {
      case 'pick':
        void pick(message);
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
          width > MAX_SIDE ||
          height > MAX_SIDE ||
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
  };

  return vscode.window.registerWebviewViewProvider(
    'bigfs.converters',
    {
      resolveWebviewView: (resolved) => {
        view = resolved;
        resolved.webview.options = {
          enableScripts: true,
          localResourceRoots: [getPageBundleFolder(context.extensionUri)],
        };
        resolved.webview.html = renderConvertersPage(resolved.webview, context.extensionUri);
        resolved.webview.onDidReceiveMessage(onMessage);
        resolved.onDidDispose(() => {
          view = undefined;
          for (const waiting of decoding.values()) {
            waiting.reject(new Error('The Converters view was closed'));
          }
          decoding.clear();
        });
      },
    },
    { webviewOptions: { retainContextWhenHidden: true } },
  );
};
