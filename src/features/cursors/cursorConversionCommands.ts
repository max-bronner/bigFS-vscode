import * as vscode from 'vscode';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { toUri, toUris } from '../../services/archives/commandTarget';
import { OUTPUT_FIELD, createReview } from '../../core/converterDialog';
import { CONVERTER_FILE_TYPES } from '../../core/converterFileTypes';
import type { ConverterValues } from '../../core/converterDialog';
import type { RgbaImage } from '../../formats/texture/textureTools';
import { collectConverterFiles } from '../../platform/collectConverterFiles';
import { resolveOutputUris } from '../../platform/resolveOutputUris';
import { openConverterDialog } from '../../platform/webview/openConverterDialog';
import type { CommandTarget } from '../../services/archives/commandTarget';
import type { CursorFrame } from '../../formats/cursor/cursorFrame';
import { parseCursorFile } from '../../formats/cursor/parseCursorFile';
import { parseHotspot } from '../../formats/cursor/parseHotspot';
import { writeCur } from '../../formats/cursor/writeCur';
import { decodePng, encodePng } from '../../node/png';
import { registerCommand } from '../../platform/commands';
import { encodeCursorFramePng } from './cursorFramePng';

const getFileName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf('/') + 1);

const getBaseName = (uri: vscode.Uri) =>
  getFileName(uri).replace(/\.[^.]+$/, '');

const resolveTargetUri = (target: CommandTarget): vscode.Uri | undefined =>
  toUri(target) ?? vscode.window.activeTextEditor?.document.uri;

const getStartFolder = () => vscode.workspace.workspaceFolders?.[0]?.uri;

const pickSaveUri = (name: string, extension: string, folder = getStartFolder()) =>
  vscode.window.showSaveDialog({
    defaultUri: folder ? vscode.Uri.joinPath(folder, name) : undefined,
    filters: { [extension.toUpperCase()]: [extension] },
  });

const pickFolder = async () => {
  const [folder] =
    (await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: getStartFolder(),
      openLabel: 'Export Here',
    })) ?? [];

  return folder;
};

const pickFrames = async (
  frames: CursorFrame[],
): Promise<CursorFrame[] | undefined> => {
  if (frames.length === 1) {
    return frames;
  }

  const choice = await vscode.window.showQuickPick(
    [
      { label: `All ${frames.length} frames`, frames },
      ...frames.map((frame, index) => ({
        label: `Frame ${index + 1}`,
        description: `${frame.width}×${frame.height}, hotspot ${frame.hotspotX},${frame.hotspotY}`,
        frames: [frame],
        index,
      })),
    ],
    { placeHolder: 'Export' },
  );

  return choice?.frames;
};

const reportExport = (output: vscode.Uri, { hotspotX, hotspotY }: CursorFrame) =>
  void vscode.window.showInformationMessage(
    `Exported ${getFileName(output)}; the hotspot is ${hotspotX},${hotspotY}, which a PNG cannot hold`,
  );

const exportFrameAsPng = async (archives: ArchiveModel, source: vscode.Uri, frameIndex: number) => {
  const { name, frame, png } = encodeCursorFramePng(
    await vscode.workspace.fs.readFile(source),
    getFileName(source),
    frameIndex,
  );
  const isBesideWritable = source.scheme === 'file' && !archives.isReadOnlyUri(source);
  const output = await pickSaveUri(
    name,
    'png',
    isBesideWritable ? vscode.Uri.joinPath(source, '..') : getStartFolder(),
  );

  if (output) {
    await vscode.workspace.fs.writeFile(output, png);
    reportExport(output, frame);
  }
};

const exportCursorAsPng = async (archives: ArchiveModel, target: CommandTarget, frameIndex?: unknown) => {
  const source = resolveTargetUri(target);

  if (!source) {
    return;
  }
  if (typeof frameIndex === 'number') {
    await exportFrameAsPng(archives, source, frameIndex);
    return;
  }

  const { frames } = parseCursorFile(
    await vscode.workspace.fs.readFile(source),
    {
      decodePng,
    },
  );
  const chosen = await pickFrames(frames);

  if (!chosen) {
    return;
  }

  const name = getBaseName(source);

  if (chosen.length === 1) {
    const output = await pickSaveUri(`${name}.png`, 'png');

    if (output) {
      await vscode.workspace.fs.writeFile(output, encodePng(chosen[0]));
      reportExport(output, chosen[0]);
    }

    return;
  }

  const folder = await pickFolder();

  if (!folder) {
    return;
  }

  const digits = String(chosen.length).length;

  await Promise.all(
    chosen.map((frame, index) =>
      vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(
          folder,
          `${name}_${String(index + 1).padStart(digits, '0')}.png`,
        ),
        encodePng(frame),
      ),
    ),
  );
  void vscode.window.showInformationMessage(
    `Exported ${chosen.length} PNGs to ${folder.fsPath}`,
  );
};

const convertPngsToCursors = async (
  extensionUri: vscode.Uri,
  archives: ArchiveModel,
  target: unknown,
  selection: unknown,
  values?: ConverterValues,
) => {
  const given = toUris(target, selection);
  const active = vscode.window.activeTextEditor?.document.uri;
  const files = await collectConverterFiles(
    given.length || !active ? given : [active],
    CONVERTER_FILE_TYPES.cursor,
  );

  if (!files) {
    return;
  }

  const images: { uri: vscode.Uri; image: RgbaImage }[] = [];
  const skipped = [...files.skipped];

  for (const uri of files.accepted) {
    try {
      images.push({ uri, image: decodePng(await vscode.workspace.fs.readFile(uri)) });
    } catch (error) {
      skipped.push(`${getFileName(uri)} (${error instanceof Error ? error.message : String(error)})`);
    }
  }
  if (!images.length) {
    throw new Error(`No PNG could be read: ${skipped.join('; ')}`);
  }

  const canWriteBeside = (uri: vscode.Uri) => uri.scheme === 'file' && !archives.isReadOnlyUri(uri);

  await openConverterDialog(
    extensionUri,
    {
      title: 'Convert to Cursor',
      heading: 'Convert PNG images to cursors',
      about: 'Each PNG becomes a .cur cursor. The hotspot is the pixel that points, counted from the top left; a PNG cannot hold it.',
      files: images.map(({ uri, image }) => ({ name: getFileName(uri), detail: `${image.width}×${image.height}` })),
      skipped,
      fields: [
        { kind: 'number', id: 'hotspotX', label: 'Hotspot x', min: 0, unit: 'px' },
        { kind: 'number', id: 'hotspotY', label: 'Hotspot y', min: 0, unit: 'px' },
        OUTPUT_FIELD,
      ],
      values: { hotspotX: 0, hotspotY: 0, output: 'beside' },
      review: ({ hotspotX, hotspotY, output }) => {
        const review = createReview();
        const problems = new Set(
          images.flatMap(({ image }) => {
            const parsed = parseHotspot(`${String(hotspotX)},${String(hotspotY)}`, image.width, image.height);

            return typeof parsed === 'string' ? [parsed] : [];
          }),
        );
        const fallback = images.filter(({ uri }) => !canWriteBeside(uri)).length;

        review.errors.push(...problems);
        if (output === 'beside' && fallback) {
          review.notes.push(`${fallback} of the images are in an archive or the base game, so their cursors go to a folder you choose.`);
        }
        return review;
      },
      convert: async ({ hotspotX, hotspotY, output }, run) => {
        const outputs = await resolveOutputUris(
          images.map(({ uri }) => uri),
          images.map(({ uri }) => `${getBaseName(uri)}.cur`),
          output,
          canWriteBeside,
        );

        if (!outputs) {
          return 'Nothing written';
        }

        let written = 0;

        for (const [at, { uri, image }] of images.entries()) {
          if (run.isCancelled()) {
            break;
          }
          run.progress(`Converting ${getFileName(uri)}`, at / images.length);
          try {
            await vscode.workspace.fs.writeFile(
              outputs[at],
              writeCur([{ ...image, hotspotX: Number(hotspotX), hotspotY: Number(hotspotY) }]),
            );
            written++;
            run.log(`${getFileName(uri)} → ${getFileName(outputs[at])}, hotspot ${String(hotspotX)},${String(hotspotY)}`);
          } catch (error) {
            run.log(`${getFileName(uri)}: ${error instanceof Error ? error.message : String(error)}`, true);
          }
        }
        return `${written} of ${images.length} converted`;
      },
    },
    values,
  );
};

export const registerCursorConversionCommands = (
  extensionUri: vscode.Uri,
  archives: ArchiveModel,
): vscode.Disposable =>
  vscode.Disposable.from(
    registerCommand('bigfs.exportCursorPng', (target: CommandTarget, frameIndex?: unknown) =>
      exportCursorAsPng(archives, target, frameIndex),
    ),
    registerCommand('bigfs.convertPngToCursor', (target?: unknown, selection?: unknown, values?: ConverterValues) =>
      convertPngsToCursors(extensionUri, archives, target, selection, values),
    ),
  );
