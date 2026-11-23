import * as vscode from 'vscode';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { toUri } from '../../services/archives/commandTarget';
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

const convertPngToCursor = async (target: CommandTarget) => {
  const source = resolveTargetUri(target);

  if (!source) {
    return;
  }

  const image = decodePng(await vscode.workspace.fs.readFile(source));
  const typed = await vscode.window.showInputBox({
    title: `Hotspot of ${getFileName(source)} (${image.width}×${image.height})`,
    prompt: 'The pixel that points, as x,y from the top left',
    value: '0,0',
    validateInput: (text) => {
      const parsed = parseHotspot(text, image.width, image.height);

      return typeof parsed === 'string' ? parsed : undefined;
    },
  });
  const hotspot =
    typed === undefined
      ? undefined
      : parseHotspot(typed, image.width, image.height);

  if (!hotspot || typeof hotspot === 'string') {
    return;
  }

  const bytes = writeCur([
    {
      ...image,
      hotspotX: hotspot.x,
      hotspotY: hotspot.y,
    },
  ]);
  const output = await pickSaveUri(`${getBaseName(source)}.cur`, 'cur');

  if (output) {
    await vscode.workspace.fs.writeFile(output, bytes);
    void vscode.window.showInformationMessage(`Wrote ${getFileName(output)}`);
  }
};

export const registerCursorConversionCommands = (archives: ArchiveModel): vscode.Disposable =>
  vscode.Disposable.from(
    registerCommand('bigfs.exportCursorPng', (target: CommandTarget, frameIndex?: unknown) =>
      exportCursorAsPng(archives, target, frameIndex),
    ),
    registerCommand('bigfs.convertPngToCursor', convertPngToCursor),
  );
