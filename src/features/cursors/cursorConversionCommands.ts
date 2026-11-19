import * as vscode from 'vscode';
import { toUri } from '../../services/archives/commandTarget';
import type { CommandTarget } from '../../services/archives/commandTarget';
import type { CursorFrame } from '../../formats/cursor/cursorFrame';
import { parseCursorFile } from '../../formats/cursor/parseCursorFile';
import { parseHotspot } from '../../formats/cursor/parseHotspot';
import { writeCur } from '../../formats/cursor/writeCur';
import { decodePng, encodePng } from '../../node/png';
import { registerCommand } from '../../platform/commands';

const getFileName = (uri: vscode.Uri) =>
  uri.path.slice(uri.path.lastIndexOf('/') + 1);

const getBaseName = (uri: vscode.Uri) =>
  getFileName(uri).replace(/\.[^.]+$/, '');

const resolveTargetUri = (target: CommandTarget): vscode.Uri | undefined =>
  toUri(target) ?? vscode.window.activeTextEditor?.document.uri;

const getStartFolder = () => vscode.workspace.workspaceFolders?.[0]?.uri;

const pickSaveUri = (name: string, extension: string) => {
  const folder = getStartFolder();

  return vscode.window.showSaveDialog({
    defaultUri: folder ? vscode.Uri.joinPath(folder, name) : undefined,
    filters: { [extension.toUpperCase()]: [extension] },
  });
};

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

const exportCursorAsPng = async (target: CommandTarget) => {
  const source = resolveTargetUri(target);

  if (!source) {
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
      void vscode.window.showInformationMessage(
        `Exported ${getFileName(output)}; the hotspot is ${chosen[0].hotspotX},${chosen[0].hotspotY}, which a PNG cannot hold`,
      );
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

export const registerCursorConversionCommands = (): vscode.Disposable =>
  vscode.Disposable.from(
    registerCommand('bigfs.exportCursorPng', exportCursorAsPng),
    registerCommand('bigfs.convertPngToCursor', convertPngToCursor),
  );
