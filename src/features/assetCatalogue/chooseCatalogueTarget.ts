import { FileType, Uri, window, workspace } from 'vscode';
import { ASSET_CATALOGUE_NAME } from '../../formats/asset/assetCatalogue';
import { detectInstallKind, isInsideSource } from '../../game/install/installLayers';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import { isReadOnlySource } from '../../services/archives/sourceAccess';

export const canHoldCatalogue = (source: ArchiveSource): boolean =>
  source.kind === 'mod' && !source.base && !isReadOnlySource(source);

const isInsideInstall = async (
  folder: Uri,
  sources: readonly ArchiveSource[],
): Promise<boolean> => {
  if (
    sources.some(
      (source) =>
        !canHoldCatalogue(source) && isInsideSource(folder.fsPath, source.baseUri.fsPath),
    )
  ) {
    return true;
  }

  try {
    const names = (await workspace.fs.readDirectory(folder))
      .filter(([, type]) => type === FileType.File)
      .map(([name]) => name);

    return detectInstallKind(names) !== 'mod';
  } catch {
    return false;
  }
};

export const chooseCatalogueTarget = async (
  catalogue: Uri,
  source: ArchiveSource,
  sources: readonly ArchiveSource[],
): Promise<Uri | undefined> => {
  if (
    canHoldCatalogue(source) &&
    !(await isInsideInstall(Uri.joinPath(catalogue, '..'), sources))
  ) {
    return catalogue;
  }

  const answer = await window.showWarningMessage(
    `${catalogue.fsPath} belongs to the game install ${source.label}, which bigFS never changes.`,
    {
      modal: true,
      detail:
        'Override in Folder writes the synced catalogue as asset.dat in a mod folder you choose; the install keeps its own.',
    },
    'Override in Folder…',
  );

  if (!answer) {
    return undefined;
  }

  const [folder] =
    (await window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      defaultUri: sources.find(canHoldCatalogue)?.baseUri,
      openLabel: 'Write Here',
      title: 'Mod folder that gets the synced asset.dat',
    })) ?? [];

  if (!folder) {
    return undefined;
  }

  if (await isInsideInstall(folder, sources)) {
    void window.showErrorMessage(
      `${folder.fsPath} is a game install, which bigFS never writes to. Choose a mod folder.`,
    );
    return undefined;
  }

  return Uri.joinPath(folder, ASSET_CATALOGUE_NAME);
};
