import * as vscode from 'vscode';
import { formatCount } from '../../core/messages';
import { decodeDds, decodeTga } from '../../formats/texture/textureTools';
import type { RgbaImage } from '../../formats/texture/textureTools';
import {
  encodeTexture,
  getOutputName,
  getTargetExtension,
  hasPowerOfTwoSides,
  isDdsTarget,
} from '../../formats/texture/textureTargets';
import { decodePng } from '../../node/png';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { ImageSettings } from '../../webview/converters/protocol';

export const MAX_SIDE = 8192;

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'tga', 'dds'];

export type DecodeInPage = (name: string, bytes: Uint8Array) => Promise<RgbaImage>;

const getFileName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf('/') + 1);

const readImage = async (uri: vscode.Uri, decodeInPage: DecodeInPage): Promise<RgbaImage> => {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const extension = uri.path.slice(uri.path.lastIndexOf('.') + 1).toLowerCase();
  const image =
    extension === 'png'
      ? decodePng(bytes)
      : extension === 'tga'
        ? decodeTga(bytes).levels[0]
        : extension === 'dds'
          ? decodeDds(bytes).levels[0]
          : await decodeInPage(getFileName(uri), new Uint8Array(bytes));

  if (!image || image.width > MAX_SIDE || image.height > MAX_SIDE) {
    throw new Error(image ? `${image.width}×${image.height} is larger than ${MAX_SIDE} on a side` : 'No image in it');
  }
  return image;
};

export const convertImages = async (
  sources: readonly vscode.Uri[],
  settings: ImageSettings,
  archives: ArchiveModel,
  decodeInPage: DecodeInPage,
  log: (text: string, isError?: boolean) => void,
): Promise<void> => {
  const extension = getTargetExtension(settings.target);
  const isBesideWritable = (uri: vscode.Uri) => uri.scheme === 'file' && !archives.isReadOnlyUri(uri);
  let folder: vscode.Uri | undefined;

  if (settings.output === 'folder' || sources.some((uri) => !isBesideWritable(uri))) {
    [folder] =
      (await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        openLabel: 'Write here',
        title: 'Folder for the converted textures',
      })) ?? [];
    if (!folder) {
      return;
    }
  }

  const outputs = sources.map((uri) => {
    const name = getOutputName(getFileName(uri), extension);

    return settings.output === 'beside' && isBesideWritable(uri)
      ? vscode.Uri.joinPath(uri, '..', name)
      : vscode.Uri.joinPath(folder!, name);
  });
  const existing = await Promise.all(
    outputs.map((uri) => vscode.workspace.fs.stat(uri).then(() => true, () => false)),
  );
  const existingCount = existing.filter(Boolean).length;

  if (
    existingCount &&
    (await vscode.window.showWarningMessage(
      `${formatCount(existingCount, 'file')} already there. Replace?`,
      { modal: true },
      'Replace',
    )) !== 'Replace'
  ) {
    return;
  }

  for (const [at, source] of sources.entries()) {
    const output = outputs[at];

    try {
      const image = await readImage(source, decodeInPage);

      await vscode.workspace.fs.writeFile(output, encodeTexture(image, settings.target, settings.mipmaps));
      log(
        `${getFileName(source)} → ${getFileName(output)} (${image.width}×${image.height})` +
          (isDdsTarget(settings.target) && !hasPowerOfTwoSides(image)
            ? ': not a power of two on each side, which the game may not load'
            : ''),
      );
    } catch (error) {
      log(`${getFileName(source)}: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }
};
