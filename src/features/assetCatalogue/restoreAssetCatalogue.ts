import { TabInputCustom, window } from 'vscode';
import type { EventEmitter } from 'vscode';
import { getOriginalTime, restoreOriginal } from '../../node/originalCopy';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { toUri } from '../../services/archives/commandTarget';
import type { CatalogueChange } from './catalogueChange';
import { canWriteCatalogue } from './chooseCatalogueTarget';

export const restoreAssetCatalogue = async (
  target: unknown,
  archives: ArchiveModel,
  changes: EventEmitter<CatalogueChange>,
): Promise<void> => {
  const input = window.tabGroups.activeTabGroup.activeTab?.input;
  const uri = toUri(target) ?? (input instanceof TabInputCustom ? input.uri : undefined);

  if (!uri || uri.scheme !== 'file') {
    void window.showInformationMessage(
      'Restore Original asset.dat works on an asset.dat on disk: run it from the file\'s menu or its viewer.',
    );
    return;
  }

  const time = await getOriginalTime(uri.fsPath);

  if (time === undefined) {
    void window.showInformationMessage(
      `There is no asset.dat.org beside ${uri.fsPath}: it is written by Sync with Assets when Keep the original is ticked.`,
    );
    return;
  }

  if (!(await canWriteCatalogue(uri, archives.getSources()))) {
    void window.showErrorMessage(
      `${uri.fsPath} belongs to a game install, which bigFS never changes; its asset.dat.org is left unused.`,
    );
    return;
  }

  const answer = await window.showWarningMessage(
    `Restore ${uri.fsPath} from asset.dat.org?`,
    {
      modal: true,
      detail: `The asset.dat.org kept on ${new Date(time).toLocaleString()} is copied over asset.dat, and every change since is lost. asset.dat.org stays.`,
    },
    'Restore',
  );

  if (answer !== 'Restore') {
    return;
  }

  await restoreOriginal(uri.fsPath);
  changes.fire({ uri, cause: 'restore' });
  void window.showInformationMessage(`Restored ${uri.fsPath} from asset.dat.org.`);
};
