import * as vscode from 'vscode';
import { createRequestSequence } from './createRequestSequence';
import { createRevisionCache } from './createRevisionCache';
import { PREVIEW_VIEW_TYPE } from '../../constants';
import type { ToolBox } from '../../core/toolRegistry';
import {
  decodeDdsTool,
  decodeTgaTool,
} from '../../formats/texture/textureTools';
import { playableAudioTool } from '../../formats/audio/audioTools';
import { buildW3dScene, loadSkeleton } from '../../formats/w3d/w3dScene';
import { decodePng } from '../../node/png';
import { parseW3dAnimations } from '../../formats/w3d/w3dAnimation';
import {
  findAnimationCarrier,
  sortClipsBySkeleton,
} from '../../formats/w3d/w3dModelFinder';
import type { SkeletonClips } from '../../formats/w3d/w3dModelFinder';
import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import { decompressEar, isEarWrapped } from '../../formats/refpack/refpack';
import { parseCursorFile } from '../../formats/cursor/parseCursorFile';
import { Vp6Movie } from '../../formats/vp6/container';
import type { EntryLocator } from '../../services/entryLocator';
import type { TextureRegions } from './createTextureRegions';
import type { FindRelatedModels } from './createRelatedModelSearch';
import { readW3dHeader } from '../../formats/w3d/readW3dHeader';
import { findDetailFiles } from '../../game/objects/detailModels';
import type { TextureLayers } from '../../formats/w3d/w3dTextureSwaps';
import { renderWebviewPage } from '../../platform/webview/webviewPage';
import { createPreviewSettingsStore } from '../../platform/webview/createPreviewSettingsStore';
import type { PreviewSettingsStore } from '../../platform/webview/createPreviewSettingsStore';
import type {
  FileUse,
  FromPreviewPage,
  ToPreviewPage,
} from '../../webview/preview/protocol';
import { describeError } from '../../core/errors';
import { getTextureCandidates } from '../../formats/ini/sageIniAssets';

const getFileName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf('/') + 1).toLowerCase();

const findSettingsStore = (
  uri: vscode.Uri,
  stores: { model: PreviewSettingsStore; texture: PreviewSettingsStore },
): PreviewSettingsStore | undefined => {
  const extension = uri.path.slice(uri.path.lastIndexOf('.')).toLowerCase();

  return extension === '.w3d'
    ? stores.model
    : extension === '.tga' || extension === '.dds'
      ? stores.texture
      : undefined;
};

const MAPPED_IMAGE_DEFINITION = /^MappedImage\s/i;

const findFileUses = (fileName: string): Thenable<FileUse[]> =>
  vscode.commands
    .executeCommand<FileUse[] | undefined>('bigfs.findFileUses', fileName)
    .then(
      (uses) => uses ?? [],
      () => [],
    );

type PreviewMessage = Extract<
  ToPreviewPage,
  {
    kind: 'texture' | 'audio' | 'video' | 'cursor' | 'model' | 'error';
  }
>;

const buildMessage = async (
  uri: vscode.Uri,
  tools: ToolBox,
  locator: EntryLocator,
  openMovie: (movie: Vp6Movie) => void,
): Promise<PreviewMessage> => {
  const extension = uri.path.slice(uri.path.lastIndexOf('.')).toLowerCase();

  try {
    const read = await vscode.workspace.fs.readFile(uri);
    const bytes = isEarWrapped(read) ? decompressEar(read) : read;

    switch (extension) {
      case '.tga':
        return { kind: 'texture', ...(await tools.use(decodeTgaTool)(bytes)) };
      case '.dds':
        return { kind: 'texture', ...(await tools.use(decodeDdsTool)(bytes)) };
      case '.wav':
        return {
          kind: 'audio',
          ...(await tools.use(playableAudioTool)(bytes)),
        };
      case '.cur':
      case '.ani':
        return {
          kind: 'cursor',
          ...parseCursorFile(bytes, { decodePng }),
        };
      case '.vp6': {
        const movie = new Vp6Movie(bytes);

        openMovie(movie);

        return {
          kind: 'video',
          width: movie.header.width,
          height: movie.header.height,
          frameCount: movie.frameCount,
          framesPerSecond: movie.framesPerSecond,
          hasAlpha: movie.hasAlpha,
        };
      }
      case '.w3d': {
        const loadFile = (fileName: string) => locator.read(fileName, uri);
        const scene = await buildW3dScene(bytes, loadFile, tools, decodePng);

        if (!scene.meshes.length && scene.animation && scene.skeleton) {
          const fromIni = await vscode.commands
            .executeCommand<
              string | undefined
            >('bigfs.findModelForAnimation', getFileName(uri))
            .then(
              (found) => found,
              () => undefined,
            );
          const carrier = await findAnimationCarrier(
            scene.skeleton.name,
            fromIni && `${fromIni.replace(/\.w3d$/i, '')}.w3d`,
            () =>
              locator.findNames(
                (name) => name.endsWith('.w3d'),
                '**/*.{w3d,W3D}',
                uri,
              ),
            loadFile,
            tools,
          );

          return {
            kind: 'model',
            ...(carrier.scene ?? scene),
            animation: scene.animation,
            animationSkeleton: scene.skeleton,
            shownOn: carrier.scene && carrier.name,
          };
        }
        return { kind: 'model', ...scene };
      }
      default:
        return { kind: 'error', message: `No preview for ${extension} files` };
    }
  } catch (error) {
    return {
      kind: 'error',
      message: describeError(error),
    };
  }
};

export const renderHtml = (
  webview: vscode.Webview,
  modelScript: vscode.Uri,
  settingsBlock = '',
): string =>
  renderWebviewPage({
    allow: {
      img: 'blob: data:',
      media: 'blob:',
      script: webview.cspSource,
    },
    styleSources: `${webview.cspSource} 'unsafe-inline'`,
    scriptFiles: [webview.asWebviewUri(modelScript).toString()],
    style: `
  body { margin: 0; padding: 0; color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  header { position: sticky; top: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 12px; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); z-index: 1; }
  header[hidden] { display: none; }
  button, select { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: none; padding: 3px 8px; border-radius: 2px; font: inherit; cursor: pointer; }
  button[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  .status { margin-left: auto; opacity: 0.8; }
  .content { display: flex; align-items: flex-start; }
  main { flex: 1; min-width: 0; padding: 12px; }
  aside { flex: none; width: 260px; box-sizing: border-box; padding: 12px; max-height: calc(100vh - 44px); overflow-y: auto; position: sticky; top: 44px; border-left: 1px solid var(--vscode-panel-border); }
  aside[hidden], .splitter[hidden] { display: none; }
  body.model-page { height: 100vh; overflow: hidden; }
  body.model-page .content { height: 100%; }
  body.model-page main { height: 100%; padding: 0; }
  body.texture-page { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  body.texture-page header { flex: none; position: static; }
  body.texture-page .content { flex: 1; min-height: 0; align-items: stretch; }
  body.texture-page main { overflow: auto; }
  body.texture-page aside { max-height: none; position: static; border-left: none; }
  .splitter { flex: none; width: 4px; cursor: col-resize; background: var(--vscode-panel-border); touch-action: none; }
  .splitter:hover { background-color: var(--vscode-sash-hoverBorder, var(--vscode-focusBorder)); }
  aside h3, aside h4 { margin: 0 0 6px; }
  aside h4 { margin-top: 10px; opacity: 0.8; }
  aside .detail { margin-bottom: 8px; }
  aside .detail p { margin: 6px 0; opacity: 0.8; }
  aside .edges { display: grid; grid-template-columns: max-content 1fr; gap: 4px 8px; margin-top: 6px; }
  aside input { width: 100%; box-sizing: border-box; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); padding: 2px 4px; }
  .where { display: inline-block; margin-left: 6px; color: var(--vscode-descriptionForeground); text-decoration: none; }
  aside .item { display: flex; width: 100%; text-align: left; margin-bottom: 2px; white-space: nowrap; }
  aside .item > span:first-child { flex: 0 0 auto; max-width: 65%; overflow: hidden; text-overflow: ellipsis; }
  aside .item > .where { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; text-align: right; }
  .side-group { margin: 8px 0 2px; font-size: 11px; color: var(--vscode-descriptionForeground); }
  .side-row { display: flex; gap: 8px; width: 100%; box-sizing: border-box; padding: 2px 6px; text-align: left; white-space: nowrap; color: inherit; background: none; }
  .side-row:hover { background: var(--vscode-list-hoverBackground); }
  .side-row[aria-pressed="true"] { color: var(--vscode-list-activeSelectionForeground, #fff); background: var(--vscode-list-activeSelectionBackground, #0e639c); }
  .side-row > span:first-child { flex: 0 0 auto; max-width: 65%; overflow: hidden; text-overflow: ellipsis; }
  .side-row > .where { flex: 1 1 0; min-width: 0; margin-left: 0; overflow: hidden; text-overflow: ellipsis; text-align: right; color: inherit; opacity: 0.7; }
  .side-more { margin: 2px 0 0 6px; }
  .uses > div { display: flex; align-items: flex-start; gap: 6px; padding: 2px 0; }
  .uses > div > a { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .uses > div > button { flex: none; }
  .stage { display: inline-block; line-height: 0; position: relative; }
  .stage.checker { background: repeating-conic-gradient(#808080 0 25%, #c0c0c0 0 50%) 0 0 / 16px 16px; }
  .stage.black { background: #000; }
  .stage.white { background: #fff; }
  canvas.pixelated { image-rendering: pixelated; }
  .error { color: var(--vscode-errorForeground); }
  audio { width: min(600px, 100%); margin-top: 8px; }
  .sound-uses { margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .sound-uses h3 { margin: 0 0 6px; }
  canvas.wave { display: block; width: min(600px, 100%); height: 64px; margin-top: 12px; color: var(--vscode-foreground); cursor: pointer; touch-action: none; }
  canvas.video { display: block; max-width: 100%; image-rendering: auto; }
  canvas.video.checker { background: repeating-conic-gradient(#808080 0 25%, #c0c0c0 0 50%) 0 0 / 16px 16px; }
  .controls { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
  .controls input[type=range] { flex: 1; min-width: 120px; }
  dl { display: grid; grid-template-columns: max-content auto; gap: 4px 16px; margin: 0; }
  dt { opacity: 0.8; }
`,
    body: `${settingsBlock}
<header id="toolbar" hidden>
  <button id="fit" aria-pressed="true" title="Fit to window">Fit</button>
  <button id="actual" aria-pressed="false" title="Actual size">1:1</button>
  <button id="zoom-out" title="Zoom out">−</button>
  <button id="zoom-in" title="Zoom in">+</button>
  <select id="channels" title="Channels">
    <option value="rgba">RGBA</option>
    <option value="rgb">RGB</option>
    <option value="alpha">Alpha</option>
  </select>
  <select id="background" title="Background">
    <option value="checker">Checker</option>
    <option value="black">Black</option>
    <option value="white">White</option>
  </select>
  <select id="level" title="Mip level"></select>
  <button id="popout" title="Open this editor in its own window, with more room for the texture and what uses it">Pop out</button>
  <span class="status" id="status"></span>
</header>
<div class="content">
  <main id="main"></main>
  <aside id="regions" hidden></aside>
</div>`,
  });

export class PreviewEditorProvider
  implements vscode.CustomReadonlyEditorProvider
{
  private readonly settings: { model: PreviewSettingsStore; texture: PreviewSettingsStore };

  public constructor(
    private readonly tools: ToolBox,
    private readonly locator: EntryLocator,
    private readonly extensionUri: vscode.Uri,
    private readonly regions: TextureRegions,
    private readonly findRelated: FindRelatedModels,
    state: vscode.Memento,
  ) {
    this.settings = {
      model: createPreviewSettingsStore(state, 'model'),
      texture: createPreviewSettingsStore(state, 'texture'),
    };
  }

  public static register(
    tools: ToolBox,
    locator: EntryLocator,
    extensionUri: vscode.Uri,
    regions: TextureRegions,
    findRelated: FindRelatedModels,
    state: vscode.Memento,
  ): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      PREVIEW_VIEW_TYPE,
      new PreviewEditorProvider(
        tools,
        locator,
        extensionUri,
        regions,
        findRelated,
        state,
      ),
      { supportsMultipleEditorsPerDocument: true },
    );
  }

  private async findAnimations(
    skeleton: SceneSkeleton,
    uri: vscode.Uri,
  ): Promise<SkeletonClips> {
    const name = skeleton.name.toLowerCase();
    const prefix = `${name.replace(/_skl$/, '')}_`;
    const names = await this.locator.findNames(
      (each) =>
        each.startsWith(prefix) &&
        each.endsWith('.w3d') &&
        each !== `${name}.w3d`,
      '**/*.{w3d,W3D}',
      uri,
    );

    return sortClipsBySkeleton(
      skeleton,
      names,
      (fileName) => this.locator.read(fileName, uri),
      this.tools,
    );
  }

  private async addDetail(shown: ToPreviewPage, uri: vscode.Uri): Promise<ToPreviewPage> {
    if (shown.kind !== 'model' || !shown.meshes.length) {
      return shown;
    }

    const detail = await findDetailFiles(
      shown.relatedFile ?? shown.shownOn ?? getFileName(uri),
      async (file) => {
        try {
          const read = await this.locator.read(file, uri);

          return read && readW3dHeader(isEarWrapped(read) ? decompressEar(read) : read).hierarchy;
        } catch {
          return undefined;
        }
      },
    ).catch(() => undefined);

    return detail ? { ...shown, detail } : shown;
  }

  private async buildRetexturedModel(
    file: string | undefined,
    shown: ToPreviewPage,
    uri: vscode.Uri,
    textures: TextureLayers,
  ): Promise<ToPreviewPage> {
    const carrier = shown.kind === 'model' ? shown.shownOn : undefined;
    const name = file ?? carrier;

    try {
      const read = name
        ? await this.locator.read(name, uri)
        : await vscode.workspace.fs.readFile(uri);

      if (!read) {
        return {
          kind: 'modelError',
          file: name ?? getFileName(uri),
          message: `${name} is not in any archive or folder`,
        };
      }

      const scene = await buildW3dScene(
        isEarWrapped(read) ? decompressEar(read) : read,
        (fileName: string) => this.locator.read(fileName, uri),
        this.tools,
        decodePng,
        textures,
        async (fileName) => !!(await this.locator.findUri(fileName, uri)),
      );

      return { kind: 'model', ...scene, relatedFile: file, isRetextured: true };
    } catch (error) {
      return { kind: 'modelError', file: name ?? getFileName(uri), message: describeError(error) };
    }
  }

  private async buildRelatedModel(
    file: string,
    uri: vscode.Uri,
  ): Promise<ToPreviewPage> {
    try {
      const read = await this.locator.read(file, uri);

      if (!read) {
        return {
          kind: 'modelError',
          file,
          message: `${file} is not in any archive or folder`,
        };
      }

      const scene = await buildW3dScene(
        isEarWrapped(read) ? decompressEar(read) : read,
        (fileName: string) => this.locator.read(fileName, uri),
        this.tools,
        decodePng,
      );

      return { kind: 'model', ...scene, relatedFile: file };
    } catch (error) {
      return { kind: 'modelError', file, message: describeError(error) };
    }
  }

  public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const scripts = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');

    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [scripts],
    };
    const settings = findSettingsStore(document.uri, this.settings);

    panel.webview.html = renderHtml(
      panel.webview,
      vscode.Uri.joinPath(scripts, 'model.js'),
      settings?.renderBlock(),
    );

    let movie: Vp6Movie | undefined;
    let attached: vscode.Disposable | undefined;
    let isDisposed = false;
    const modelRequests = createRequestSequence();
    const textureRequests = createRequestSequence();
    const clipLists = createRevisionCache<Promise<SkeletonClips>>(
      () => this.locator.revision,
    );
    const post = async (reply: unknown): Promise<void> => {
      if (!isDisposed) {
        await panel.webview.postMessage(reply);
      }
    };
    const message = buildMessage(
      document.uri,
      this.tools,
      this.locator,
      (opened) => {
        movie = opened;
      },
    ).then((built) => this.addDetail(built, document.uri));
    const subscription = panel.webview.onDidReceiveMessage(
      async (received: FromPreviewPage) => {
        if (received.kind === 'ready') {
          const isCurrent = modelRequests.begin();
          const built = await message;

          await post(built);

          if (isDisposed) {
            return;
          }
          if (built.kind === 'model') {
            void this.findRelated(document.uri).then((found) =>
              post({ kind: 'related', file: getFileName(document.uri), ...found }),
            );
          }

          attached?.dispose();
          if (built.kind === 'texture' && built.levels[0]) {
            attached = this.regions.attach(
              document.uri,
              [built.levels[0].width, built.levels[0].height],
              (regionsMessage) => void post(regionsMessage),
            );
          }
          if (built.kind === 'model' && built.skeleton) {
            const clips = await clipLists.get(
              built.skeleton.name.toLowerCase(),
              () => this.findAnimations(built.skeleton!, document.uri),
            );

            if (isCurrent()) {
              await post({ kind: 'animations', ...clips });
            }
          }
          if (built.kind === 'model' || built.kind === 'audio') {
            await post({ kind: 'uses', uses: await findFileUses(getFileName(document.uri)) });
          } else if (built.kind === 'texture') {
            const uses = await findFileUses(getTextureCandidates(getFileName(document.uri))[0]);

            await post({
              kind: 'uses',
              uses: uses.filter((use) => !MAPPED_IMAGE_DEFINITION.test(use.owner ?? '')),
            });
          }
        } else if (received.kind === 'showModel') {
          const isCurrentTexture = textureRequests.begin();

          if (received.textures) {
            const retextured = await this.buildRetexturedModel(
              received.file,
              await message,
              document.uri,
              received.textures,
            );

            if (isCurrentTexture()) {
              await post(retextured);
            }
            return;
          }

          const isCurrent = modelRequests.begin();
          const shown = received.file
            ? await this.addDetail(
                await this.buildRelatedModel(received.file, document.uri),
                document.uri,
              )
            : await message;

          if (!isCurrent()) {
            return;
          }
          await post(shown);
          if (shown.kind === 'model') {
            const skeleton = shown.skeleton;
            const clips = skeleton
              ? await clipLists.get(skeleton.name.toLowerCase(), () =>
                  this.findAnimations(skeleton, document.uri),
                )
              : { own: [], foreign: [] };

            if (isCurrent()) {
              await post({ kind: 'animations', ...clips });
            }
          }
        } else if (received.kind === 'keepSettings') {
          await settings?.keep(received.settings);
        } else if (received.kind === 'popOut') {
          if (!panel.active) {
            panel.reveal();
          }
          await vscode.commands.executeCommand(
            'workbench.action.moveEditorToNewWindow',
          );
        } else if (received.kind === 'editRegion') {
          await this.regions.edit(document.uri, received.id, received.rect);
        } else if (received.kind === 'previewObject') {
          await vscode.commands.executeCommand(
            'bigfs.previewObject',
            vscode.Uri.parse(received.uri),
            received.line,
          );
        } else if (received.kind === 'reveal') {
          const position = new vscode.Position(received.line || 0, 0);

          await vscode.window.showTextDocument(vscode.Uri.parse(received.uri), {
            selection: new vscode.Range(position, position),
          });
        } else if (received.kind === 'saveCursorFrame' && Number.isInteger(received.index)) {
          await vscode.commands.executeCommand('bigfs.exportCursorPng', document.uri, received.index);
        } else if (received.kind === 'videoFrame' && movie) {
          const index = received.index;

          try {
            const pixels = movie.decodeFrame(index);

            await post({
              kind: 'videoFrame',
              index,
              pixels: new Uint8Array(pixels.buffer),
            });
          } catch (error) {
            await post({
              kind: 'videoError',
              message: describeError(error),
            });
          }
        } else if (received.kind === 'animation') {
          const name = received.file;
          let reply: ToPreviewPage;

          try {
            const bytes = await this.locator.read(name, document.uri);
            const [animation] = bytes ? parseW3dAnimations(bytes) : [];

            reply = animation
              ? {
                  kind: 'animation',
                  file: name,
                  animation,
                  skeleton: await loadSkeleton(
                    animation.hierarchyName,
                    (fileName) => this.locator.read(fileName, document.uri),
                    this.tools,
                  ),
                }
              : {
                  kind: 'animationError',
                  message: `${name} holds no animation`,
                };
          } catch (error) {
            reply = {
              kind: 'animationError',
              message: describeError(error),
            };
          }

          await post(reply);
        }
      },
    );

    panel.onDidDispose(() => {
      isDisposed = true;
      subscription.dispose();
      attached?.dispose();
    });
  }
}
