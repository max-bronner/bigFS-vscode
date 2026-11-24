import { readFile } from 'fs/promises';
import * as path from 'path';
import {
  commands,
  ProgressLocation,
  QuickPickItemKind,
  ThemeIcon,
  Uri,
  window,
  workspace,
} from 'vscode';
import type { Disposable, QuickPickItem } from 'vscode';
import { decodeIniText } from '../../core/windows1252';
import { describeFileVersion, getSideTitle } from '../../game/install/describeFileVersion';
import type { FileVersion } from '../../game/install/listFileVersions';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { toUri } from '../../services/archives/commandTarget';
import { findFileVersions, findVersionSide } from '../../services/archives/findFileVersions';
import type { VersionRef } from '../../services/archives/findFileVersions';
import type { GameViewModel } from '../../services/archives/gameViewModel';
import { getNodeUri } from '../../services/archives/nodeAddress';
import { getFileNodes } from '../../services/archives/virtualTree';
import { registerCommand } from '../../platform/commands';

const COMPARED_FILES = /\.(ini|inc)$/i;

const READ_ONLY_SCHEME = 'bigfs-version';

interface VersionItem extends QuickPickItem {
  version?: FileVersion<VersionRef>;
  choose?: 'disk' | 'archive';
}

const getFileName = (uri: Uri): string => path.posix.basename(uri.path);

const toGamePathText = (gamePath: string): string => gamePath.replace(/\//g, '\\');

const toReadOnlyUri = (uri: Uri): Uri =>
  Uri.from({ scheme: READ_ONLY_SCHEME, path: uri.path, query: uri.toString() });

export const registerCompareVersions = (
  archives: ArchiveModel,
  gameView: GameViewModel,
): Disposable[] => {
  const getTitle = (uri: Uri): string => {
    const side = findVersionSide(archives, uri);
    const fileName = getFileName(uri);

    return side
      ? getSideTitle(fileName, side)
      : `${fileName} (${path.posix.basename(path.posix.dirname(uri.path))})`;
  };

  const chooseOnDisk = async (from: Uri): Promise<Uri | undefined> => {
    const [picked] =
      (await window.showOpenDialog({
        canSelectMany: false,
        defaultUri: from.scheme === 'file' ? Uri.file(path.dirname(from.fsPath)) : undefined,
        filters: { 'INI files': ['ini', 'inc'], 'All files': ['*'] },
        openLabel: 'Compare',
        title: `Compare ${getFileName(from)} with`,
      })) ?? [];

    return picked;
  };

  const chooseInArchive = async (from: Uri): Promise<Uri | undefined> => {
    const items = archives.getSources().flatMap((source) =>
      archives
        .getArchivesOf(source.id)
        .filter((archive) => archive.isLoaded)
        .flatMap((archive) =>
          getFileNodes(archive.root)
            .filter((node) => COMPARED_FILES.test(node.name))
            .map((node) => ({
              label: node.name,
              description: `${archive.pathInSource} · ${source.label}`,
              detail: node.entryPath,
              uri: getNodeUri(node),
            })),
        ),
    );
    const picked = await window.showQuickPick(items, {
      title: `Compare ${getFileName(from)} with`,
      placeHolder: 'An INI or INC file of any archive',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    return picked?.uri;
  };

  const compare = async (left: Uri, right: Uri): Promise<void> => {
    const shown = left.scheme === 'file' && archives.isReadOnlyUri(left) ? toReadOnlyUri(left) : left;

    await commands.executeCommand(
      'vscode.diff',
      shown,
      right,
      `${getTitle(left)} ↔ ${getTitle(right)}`,
    );
  };

  return [
    workspace.registerTextDocumentContentProvider(READ_ONLY_SCHEME, {
      provideTextDocumentContent: async (uri) =>
        decodeIniText(await readFile(Uri.parse(uri.query).fsPath)),
    }),
    registerCommand('bigfs.compareWithOtherVersion', async (target?: unknown) => {
      const uri = toUri(target) ?? window.activeTextEditor?.document.uri;

      if (!uri || !COMPARED_FILES.test(uri.path)) {
        void window.showWarningMessage('Compare with Other Version works on an INI or INC file.');
        return;
      }

      const found = await window.withProgress(
        { location: ProgressLocation.Window, title: 'Finding other versions' },
        () => findFileVersions(archives, gameView, uri),
      );
      const fileName = getFileName(uri);
      const versions = found?.versions.others ?? [];

      if (!found || !versions.length) {
        const where = found ? toGamePathText(found.gamePath) : fileName;
        const choice = await window.showInformationMessage(
          `No other version of ${where} is in the archives or folders bigFS knows of.`,
          'Choose a File…',
        );
        const left = choice && (await chooseOnDisk(uri));

        if (left) {
          await compare(left, uri);
        }
        return;
      }

      const { open, retail } = found.versions;
      const toItem = (version: FileVersion<VersionRef>): VersionItem => ({
        ...describeFileVersion(version, {
          isRetailOriginal: version === retail,
          size: version.ref.size,
          modified: version.ref.modified,
        }),
        iconPath: new ThemeIcon(version.archive === undefined ? 'file' : 'archive'),
        version,
      });
      const own = versions.filter((version) => !version.isOtherStack);
      const other = versions.filter((version) => version.isOtherStack);
      const items: VersionItem[] = [
        ...own.map(toItem),
        ...(other.length
          ? [{ label: 'Other games and mods', kind: QuickPickItemKind.Separator }, ...other.map(toItem)]
          : []),
        { label: '', kind: QuickPickItemKind.Separator },
        { label: 'Choose a File on Disk…', iconPath: new ThemeIcon('folder-opened'), choose: 'disk' },
        { label: 'Choose a File in an Archive…', iconPath: new ThemeIcon('archive'), choose: 'archive' },
      ];
      const openTitle = open
        ? `${getSideTitle(fileName, open)}, which ${open.place === 1 ? 'wins' : 'the game ignores'},`
        : fileName;
      const quickPick = window.createQuickPick<VersionItem>();

      quickPick.title = `Compare ${toGamePathText(found.gamePath)}`;
      quickPick.placeholder = `Compare ${openTitle} with…`;
      quickPick.items = items;
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;
      quickPick.activeItems = [items.find((item) => item.version && item.version === retail) ?? items[0]];

      const picked = await new Promise<VersionItem | undefined>((resolve) => {
        quickPick.onDidAccept(() => resolve(quickPick.selectedItems[0]));
        quickPick.onDidHide(() => resolve(undefined));
        quickPick.show();
      });

      quickPick.dispose();

      const left =
        picked?.version?.ref.uri ??
        (picked?.choose === 'disk'
          ? await chooseOnDisk(uri)
          : picked?.choose === 'archive'
            ? await chooseInArchive(uri)
            : undefined);

      if (left) {
        await compare(left, uri);
      }
    }),
  ];
};
