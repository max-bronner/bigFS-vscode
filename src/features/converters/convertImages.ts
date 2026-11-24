import * as vscode from 'vscode';
import { OUTPUT_FIELD, createReview } from '../../core/converterDialog';
import { CONVERTER_FILE_TYPES } from '../../core/converterFileTypes';
import type { ConverterValues } from '../../core/converterDialog';
import { decodeDds, decodeTga } from '../../formats/texture/textureTools';
import type { RgbaImage } from '../../formats/texture/textureTools';
import {
  TEXTURE_TARGETS,
  encodeTexture,
  getOutputName,
  getTargetExtension,
  hasPowerOfTwoSides,
  isDdsTarget,
} from '../../formats/texture/textureTargets';
import type { TextureTarget } from '../../formats/texture/textureTargets';
import { decodePng } from '../../node/png';
import { collectConverterFiles } from '../../platform/collectConverterFiles';
import { resolveOutputUris } from '../../platform/resolveOutputUris';
import { openConverterDialog } from '../../platform/webview/openConverterDialog';
import type { ConversionRun } from '../../platform/webview/openConverterDialog';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { toUris } from '../../services/archives/commandTarget';

export const MAX_SIDE = 8192;


const getFileName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf('/') + 1);

const readImage = async (uri: vscode.Uri, run: ConversionRun): Promise<RgbaImage> => {
  const bytes = await vscode.workspace.fs.readFile(uri);
  const extension = uri.path.slice(uri.path.lastIndexOf('.') + 1).toLowerCase();
  const image =
    extension === 'png'
      ? decodePng(bytes)
      : extension === 'tga'
        ? decodeTga(bytes).levels[0]
        : extension === 'dds'
          ? decodeDds(bytes).levels[0]
          : await run.decodeImage(bytes);

  if (!image || image.width > MAX_SIDE || image.height > MAX_SIDE) {
    throw new Error(image ? `${image.width}×${image.height} is larger than ${MAX_SIDE} on a side` : 'No image in it');
  }
  return image;
};

const readTarget = (value: unknown): TextureTarget =>
  TEXTURE_TARGETS.find(({ target }) => target === value)?.target ?? 'DXT5';

export const convertImages = async (
  extensionUri: vscode.Uri,
  archives: ArchiveModel,
  target?: unknown,
  selection?: unknown,
  values?: ConverterValues,
): Promise<void> => {
  const files = await collectConverterFiles(toUris(target, selection), CONVERTER_FILE_TYPES.image);

  if (!files) {
    return;
  }

  const canWriteBeside = (uri: vscode.Uri) => uri.scheme === 'file' && !archives.isReadOnlyUri(uri);

  await openConverterDialog(
    extensionUri,
    {
      title: 'Convert to Game Texture',
      heading: 'Convert images to game textures',
      about: 'PNG, JPEG, BMP, GIF, WebP, TGA or DDS to the TGA or DDS the game reads.',
      files: files.accepted.map((uri) => ({ name: getFileName(uri) })),
      skipped: files.skipped,
      fields: [
        {
          kind: 'select',
          id: 'target',
          label: 'Format',
          options: TEXTURE_TARGETS.map(({ target: value, label, description }) => ({
            value,
            label: `${label} (${description})`,
          })),
        },
        { kind: 'checkbox', id: 'mipmaps', label: 'Mipmaps (the smaller levels a DDS carries)' },
        OUTPUT_FIELD,
      ],
      values: { target: 'DXT5', mipmaps: true, output: 'beside' },
      review: ({ target: format, output }) => {
        const review = createReview();
        const fallback = files.accepted.filter((uri) => !canWriteBeside(uri)).length;

        if (!isDdsTarget(readTarget(format))) {
          review.hidden.push('mipmaps');
        } else {
          review.notes.push('A DDS should be a power of two on each side; the result says which are not.');
        }
        if (output === 'beside' && fallback) {
          review.notes.push(`${fallback} of the images are in an archive or the base game, so their textures go to a folder you choose.`);
        }
        return review;
      },
      convert: async ({ target: format, mipmaps, output }, run) => {
        const textureTarget = readTarget(format);
        const extension = getTargetExtension(textureTarget);
        const outputs = await resolveOutputUris(
          files.accepted,
          files.accepted.map((uri) => getOutputName(getFileName(uri), extension)),
          output,
          canWriteBeside,
        );

        if (!outputs) {
          return 'Nothing written';
        }

        let written = 0;

        for (const [at, source] of files.accepted.entries()) {
          if (run.isCancelled()) {
            break;
          }
          run.progress(`Converting ${getFileName(source)}`, at / files.accepted.length);
          try {
            const image = await readImage(source, run);

            await vscode.workspace.fs.writeFile(outputs[at], encodeTexture(image, textureTarget, mipmaps === true));
            written++;
            run.log(
              `${getFileName(source)} → ${getFileName(outputs[at])} (${image.width}×${image.height})` +
                (isDdsTarget(textureTarget) && !hasPowerOfTwoSides(image)
                  ? ': not a power of two on each side, which the game may not load'
                  : ''),
            );
          } catch (error) {
            run.log(`${getFileName(source)}: ${error instanceof Error ? error.message : String(error)}`, true);
          }
        }
        return `${written} of ${files.accepted.length} converted`;
      },
    },
    values,
  );
};
