import * as vscode from 'vscode';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { ReadOnlySourceError } from '../../services/archives/sourceAccess';
import { toUri } from '../../services/archives/commandTarget';
import type { CommandTarget } from '../../services/archives/commandTarget';
import { decodeDds, decodeTga } from '../../formats/texture/textureTools';
import type { DecodedTexture } from '../../formats/texture/textureTools';
import {
  DdsFormat,
  encodeDds,
  encodeTga,
} from '../../formats/texture/textureEncode';
import {
  TEXTURE_TARGETS,
  encodeTexture,
  getTargetExtension,
  hasPowerOfTwoSides,
  isDdsTarget,
} from '../../formats/texture/textureTargets';
import { decodePng, encodePng } from '../../node/png';
import { registerCommand } from '../../platform/commands';
import { describeError } from '../../core/errors';

const resolveTargetUri = (target: CommandTarget): vscode.Uri | undefined =>
  toUri(target) ?? vscode.window.activeTextEditor?.document.uri;

const getFileName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf('/') + 1);

const decodeTexture = (uri: vscode.Uri, bytes: Uint8Array): DecodedTexture =>
  /\.dds$/i.test(uri.path) ? decodeDds(bytes) : decodeTga(bytes);

export const encodeLike = (
  image: { width: number; height: number; pixels: Uint8Array },
  original: DecodedTexture,
  isDds: boolean,
): Uint8Array => {
  if (!isDds) {
    return encodeTga(image, original.hasAlpha);
  }

  const format: DdsFormat = ['DXT1', 'DXT3', 'DXT5'].includes(original.format)
    ? (original.format as DdsFormat)
    : 'RGBA';

  return encodeDds(image, format, original.levels.length > 1);
};

const pickOutput = async (
  archives: ArchiveModel,
  source: vscode.Uri,
  name: string,
): Promise<vscode.Uri | undefined> => {
  if (source.scheme === 'file' && !archives.isReadOnlyUri(source)) {
    return vscode.Uri.joinPath(source, '..', name);
  }

  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;

  return vscode.window.showSaveDialog({
    defaultUri: folder ? vscode.Uri.joinPath(folder, name) : undefined,
    filters: { Images: [name.slice(name.lastIndexOf('.') + 1)] },
  });
};

const run = (task: () => Promise<void>) => async () => {
  try {
    await task();
  } catch (error) {
    void vscode.window.showErrorMessage(
      describeError(error),
    );
  }
};

export const registerTextureCommands = (
  context: vscode.ExtensionContext,
  archives: ArchiveModel,
): void => {
  context.subscriptions.push(
    registerCommand(
      'bigfs.exportPng',
      (target: CommandTarget) =>
        run(async () => {
          const source = resolveTargetUri(target);

          if (!source) {
            return;
          }

          const texture = decodeTexture(
            source,
            await vscode.workspace.fs.readFile(source),
          );
          const output = await pickOutput(
            archives,
            source,
            getFileName(source).replace(/\.[^.]+$/, '.png'),
          );

          if (output) {
            await vscode.workspace.fs.writeFile(
              output,
              encodePng(texture.levels[0]),
            );
            void vscode.window.showInformationMessage(
              `Exported ${getFileName(output)}`,
            );
          }
        })(),
    ),
    registerCommand(
      'bigfs.importImage',
      (target: CommandTarget) =>
        run(async () => {
          const destination = resolveTargetUri(target);

          if (!destination) {
            return;
          }

          if (archives.isReadOnlyUri(destination)) {
            throw new ReadOnlySourceError('The base game');
          }

          const original = decodeTexture(
            destination,
            await vscode.workspace.fs.readFile(destination),
          );
          const [picked] =
            (await vscode.window.showOpenDialog({
              canSelectMany: false,
              filters: { 'PNG images': ['png'] },
            })) ?? [];

          if (!picked) {
            return;
          }

          const image = decodePng(await vscode.workspace.fs.readFile(picked));
          const [first] = original.levels;

          if (
            (image.width !== first.width || image.height !== first.height) &&
            (await vscode.window.showWarningMessage(
              `The image is ${image.width}×${image.height}; ${getFileName(destination)} is ${first.width}×${first.height}. Replace it anyway?`,
              { modal: true },
              'Replace',
            )) !== 'Replace'
          ) {
            return;
          }

          await vscode.workspace.fs.writeFile(
            destination,
            encodeLike(image, original, /\.dds$/i.test(destination.path)),
          );
          void vscode.window.showInformationMessage(
            `Replaced ${getFileName(destination)} (${original.format})`,
          );
        })(),
    ),
    registerCommand(
      'bigfs.convertPng',
      (target: CommandTarget) =>
        run(async () => {
          const source = resolveTargetUri(target);

          if (!source) {
            return;
          }

          const choice = await vscode.window.showQuickPick(
            TEXTURE_TARGETS.map((each) => ({
              ...each,
              description: isDdsTarget(each.target)
                ? `${each.description}, mipmaps`
                : each.description,
            })),
            { placeHolder: 'Convert to' },
          );

          if (!choice) {
            return;
          }

          const extension = getTargetExtension(choice.target);
          const image = decodePng(await vscode.workspace.fs.readFile(source));

          if (extension === 'dds' && !hasPowerOfTwoSides(image)) {
            void vscode.window.showWarningMessage(
              'DDS textures should be a power of two on each side; the game may not load this one.',
            );
          }

          const output = await pickOutput(
            archives,
            source,
            getFileName(source).replace(/\.png$/i, `.${extension}`),
          );

          if (output) {
            await vscode.workspace.fs.writeFile(output, encodeTexture(image, choice.target, true));
            void vscode.window.showInformationMessage(
              `Wrote ${getFileName(output)}`,
            );
          }
        })(),
    ),
  );
};
