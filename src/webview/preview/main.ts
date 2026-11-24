import { getVsCodeApi } from '../shared/vscodeApi';
import { createPreviewSettings, readKeptSettings } from '../shared/createPreviewSettings';
import { showAudio } from './audio';
import { createModelPage } from './createModelPage';
import type { ModelPage } from './createModelPage';
import { createRegionEditor } from './createRegionEditor';
import { showCursor } from './cursor';
import { showMovie } from './movie';
import type { MovieControl } from './movie';
import type { FileUse, FromPreviewPage, ToPreviewPage } from './protocol';
import { createTexturePage } from './texture';
import { TEXTURE_SECTION, TEXTURE_SETTINGS } from './previewPageSettings';

const vscode = getVsCodeApi<FromPreviewPage>();
const main = document.getElementById('main')!;
const settings = createPreviewSettings(readKeptSettings(), (kept) =>
  vscode.postMessage({ kind: 'keepSettings', settings: kept }),
);
const textureSettings = settings.section(TEXTURE_SECTION, TEXTURE_SETTINGS);
const regions = createRegionEditor(
  document.getElementById('regions')!,
  (message) => vscode.postMessage(message),
  textureSettings,
);
const showTexture = createTexturePage(main, regions, textureSettings, {
  onPopOut: () => vscode.postMessage({ kind: 'popOut' }),
});
let modelPage: ModelPage | undefined;
let showUses: ((uses: readonly FileUse[]) => void) | undefined;
let movie: MovieControl | undefined;
let frameError: HTMLParagraphElement | undefined;

window.addEventListener('message', ({ data }: MessageEvent<ToPreviewPage>) => {
  switch (data.kind) {
    case 'model':
      modelPage ??= createModelPage(main, settings, (message) => vscode.postMessage(message));
      modelPage.show(data);
      showUses = modelPage.setUses;
      break;
    case 'video':
      frameError = undefined;
      movie = showMovie(main, data, (message) => vscode.postMessage(message));
      break;
    case 'videoFrame':
      frameError?.remove();
      movie?.show(data.index, data.pixels);
      break;
    case 'videoError': {
      movie?.reportFrameError();
      if (!frameError) {
        frameError = document.createElement('p');
        frameError.className = 'error';
      }
      frameError.textContent = `Cannot decode this frame: ${data.message}`;
      main.append(frameError);
      break;
    }
    case 'uses':
      showUses?.(data.uses);
      break;
    case 'related':
      modelPage?.setRelated(data.file, data.files, data.textures);
      break;
    case 'animations':
      modelPage?.setAnimations(data.own, data.foreign);
      break;
    case 'animation':
      modelPage?.play(data);
      break;
    case 'modelError':
      modelPage?.showModelError(data.message);
      break;
    case 'animationError':
      modelPage?.showNotice(data.message);
      break;
    case 'texture':
      showTexture(data);
      showUses = regions.showUses;
      break;
    case 'regions':
      regions.show(data);
      break;
    case 'audio':
      showUses = showAudio(main, data, ({ uri, line }) =>
        vscode.postMessage({ kind: 'reveal', uri, line }),
      );
      break;
    case 'cursor':
      showCursor(main, data, (index) => vscode.postMessage({ kind: 'saveCursorFrame', index }));
      break;
    case 'error': {
      const error = document.createElement('p');

      error.className = 'error';
      error.textContent = `Cannot preview this file: ${data.message}`;
      main.replaceChildren(error);
      break;
    }
  }
});

vscode.postMessage({ kind: 'ready' });
