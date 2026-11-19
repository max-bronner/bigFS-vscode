import {
  CancellationError,
  ProgressLocation,
  Uri,
  ViewColumn,
  commands,
  window,
  workspace,
} from 'vscode';
import type { CancellationToken, Progress } from 'vscode';
import { formatCount } from '../../core/messages';
import { describeError } from '../../core/errors';
import {
  ASSET_CATALOGUE_NAME,
  ASSET_CATALOGUE_VERSION,
  parseAssetCatalogue,
  toFileTime,
  writeAssetCatalogue,
} from '../../formats/asset/assetCatalogue';
import type { AssetCatalogue, FileTime } from '../../formats/asset/assetCatalogue';
import { readW3dAssetEntries } from '../../formats/asset/readW3dAssetEntries';
import type { W3dAssetContents } from '../../formats/asset/readW3dAssetEntries';
import { applyAssetChanges } from '../../game/asset/applyAssetChanges';
import type { RecordUpdate } from '../../game/asset/applyAssetChanges';
import { compareAssetCatalogue, isRecordStale } from '../../game/asset/compareAssetCatalogue';
import type { AssetFile, RecordCheck } from '../../game/asset/compareAssetCatalogue';
import type { GameFile } from '../../game/install/gameView';
import { writeFileAtomically } from '../../node/writeFileAtomically';
import {
  getPageBundleFolder,
  getPageBundleOptions,
} from '../../platform/webview/pageBundle';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import { getNodeUri } from '../../services/archives/nodeAddress';
import { findAssetCatalogue } from '../../services/archives/findAssetCatalogue';
import type { GameFileRef } from '../../services/archives/gameViewModel';
import type { Services } from '../../services/createServices';
import type {
  FromAssetCataloguePage,
  SyncGroup,
  SyncMessage,
  SyncResultMessage,
} from '../../webview/assetCatalogue/protocol';
import { canHoldCatalogue, chooseCatalogueTarget } from './chooseCatalogueTarget';
import { collectAssetCandidates } from './collectAssetCandidates';
import { renderAssetCataloguePage } from './renderAssetCataloguePage';

type GameAsset = AssetFile<GameFile<GameFileRef>>;

interface SyncFindings {
  catalogue: AssetCatalogue;
  source: ArchiveSource;
  missing: GameAsset[];
  gone: AssetCatalogue['records'];
  stale: RecordCheck<GameFile<GameFileRef>>[];
}

const readCatalogue = async (uri: Uri): Promise<AssetCatalogue> => {
  let bytes: Uint8Array;

  try {
    bytes = await workspace.fs.readFile(uri);
  } catch {
    return { version: ASSET_CATALOGUE_VERSION, records: [], dependencies: [] };
  }

  return parseAssetCatalogue(bytes);
};

const readGameFiles = async <T extends { ref: GameFileRef }>(
  items: readonly T[],
  { archives }: Services,
  token: CancellationToken,
  onFile: (item: T, bytes: Uint8Array) => void,
): Promise<void> => {
  const check = () => {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
  };
  const entries = items.flatMap((item) =>
    item.ref.kind === 'entry' ? [{ item, node: item.ref.node }] : [],
  );

  await archives.readFiles(entries, async ({ item }, bytes) => {
    check();
    onFile(item, bytes);
  });

  for (const item of items) {
    if (item.ref.kind === 'loose') {
      check();
      onFile(item, await workspace.fs.readFile(item.ref.uri));
    }
  }
};

const createTimeReader = () => {
  const times = new Map<string, Promise<FileTime>>();

  return (ref: GameFileRef): Promise<FileTime> => {
    const uri = ref.kind === 'loose' ? ref.uri : Uri.file(ref.node.archive.archivePath);
    const key = uri.toString();

    if (!times.has(key)) {
      times.set(key, Promise.resolve(workspace.fs.stat(uri)).then(({ mtime }) => toFileTime(mtime)));
    }

    return times.get(key)!;
  };
};

const findDifferences = async (
  uri: Uri,
  services: Services,
  progress: Progress<{ message?: string; increment?: number }>,
  token: CancellationToken,
): Promise<SyncFindings> => {
  const catalogue = await readCatalogue(uri);

  progress.report({ message: 'reading the game view' });

  const scope = await collectAssetCandidates(uri, services.archives, services.gameView);

  if (!scope) {
    throw new Error(
      `${uri.fsPath} is in no workspace folder or game install bigFS reads, so there are no files to compare it with.`,
    );
  }

  const { missing, gone, toCheck } = compareAssetCatalogue(catalogue.records, scope.candidates);
  const stale: SyncFindings['stale'] = [];
  const step = toCheck.length ? 100 / toCheck.length : 0;
  let done = 0;

  await readGameFiles(
    toCheck.map((check) => ({ check, ref: check.file.ref.ref })),
    services,
    token,
    ({ check }, bytes) => {
      if (isRecordStale(check.record, readW3dAssetEntries(bytes))) {
        stale.push(check);
      }
      done++;
      progress.report({
        message: `checking models, ${done} of ${toCheck.length}`,
        increment: step,
      });
    },
  );

  return { catalogue, source: scope.source, missing, gone, stale };
};

const findFileUri = (
  findings: SyncFindings,
  group: SyncGroup,
  id: string,
): Uri | undefined => {
  const file =
    group === 'missing'
      ? findings.missing.find((each) => each.key === id)
      : group === 'stale'
        ? findings.stale.find(({ record }) => record.name === id)?.file
        : undefined;
  const ref = file?.ref.ref;

  return ref && (ref.kind === 'loose' ? ref.uri : getNodeUri(ref.node));
};

const toSyncMessage = (uri: Uri, findings: SyncFindings): SyncMessage => ({
  kind: 'sync',
  catalogue: uri.fsPath,
  target: canHoldCatalogue(findings.source)
    ? uri.fsPath
    : `asset.dat in a mod folder you choose (Override in Folder); ${findings.source.label} keeps its own`,
  groups: {
    missing: findings.missing.map((file) => ({
      id: file.key,
      name: file.name,
      path: file.entryPath,
      origin: file.ref.origin,
    })),
    stale: findings.stale.map(({ record, file }) => ({
      id: record.name,
      name: record.name,
      path: file.entryPath,
      origin: file.ref.origin,
    })),
    gone: findings.gone.map((record) => ({ id: record.name, name: record.name })),
  },
});

const applySelection = async (
  uri: Uri,
  findings: SyncFindings,
  selected: Record<SyncGroup, string[]>,
  services: Services,
): Promise<SyncResultMessage | undefined> => {
  const target = await chooseCatalogueTarget(uri, findings.source, services.archives.getSources());

  if (!target) {
    return undefined;
  }

  const ticked = {
    missing: new Set(selected.missing),
    stale: new Set(selected.stale),
    gone: new Set(selected.gone),
  };
  const missing = findings.missing.filter((file) => ticked.missing.has(file.key));
  const stale = findings.stale.filter(({ record }) => ticked.stale.has(record.name));
  const remove = findings.gone
    .filter((record) => ticked.gone.has(record.name))
    .map((record) => record.name);
  const count = missing.length + stale.length + remove.length;
  let exists = true;

  try {
    await workspace.fs.stat(target);
  } catch {
    exists = false;
  }

  const answer = await window.showInformationMessage(
    `Write ${formatCount(count, 'change')} to ${target.fsPath}?`,
    {
      modal: true,
      detail: `${missing.length} added, ${stale.length} written again, ${remove.length} removed.${exists ? ' The file there is replaced.' : ''}`,
    },
    'Write',
  );

  if (answer !== 'Write') {
    return undefined;
  }

  const toWrite = [
    ...missing.map((file) => ({ name: file.name, file })),
    ...stale.map(({ record, file }) => ({ name: record.name, file })),
  ];
  const contents = new Map<GameAsset, W3dAssetContents>();
  const getTime = createTimeReader();
  const put: RecordUpdate[] = await window.withProgress(
    { location: ProgressLocation.Notification, title: 'Reading the models to catalogue', cancellable: true },
    async (_progress, token) => {
      await readGameFiles(
        toWrite
          .filter(({ file }) => file.kind === 'model')
          .map(({ file }) => ({ file, ref: file.ref.ref })),
        services,
        token,
        ({ file }, bytes) => contents.set(file, readW3dAssetEntries(bytes)),
      );

      return Promise.all(
        toWrite.map(async ({ name, file }) => ({
          name,
          kind: file.kind,
          timestamp: await getTime(file.ref.ref),
          contents: contents.get(file),
        })),
      );
    },
  );
  const synced = applyAssetChanges(findings.catalogue, { put, remove });

  await writeFileAtomically(target.fsPath, writeAssetCatalogue(synced));

  if (!exists) {
    void commands.executeCommand('bigfs.refreshArchives');
  }

  return {
    kind: 'applied',
    text: `Wrote ${target.fsPath}: ${formatCount(synced.records.length, 'record')}. Reopen it to see the change.`,
  };
};

const showSyncPanel = (
  uri: Uri,
  findings: SyncFindings,
  services: Services,
  extensionUri: Uri,
): void => {
  const panel = window.createWebviewPanel(
    'bigfs.assetSync',
    `Sync ${findings.source.label} ${ASSET_CATALOGUE_NAME}`,
    ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [getPageBundleFolder(extensionUri)],
    },
  );
  const post = (message: SyncMessage | SyncResultMessage) =>
    void panel.webview.postMessage(message);

  panel.webview.html = renderAssetCataloguePage(
    getPageBundleOptions(extensionUri, panel.webview, 'assetCatalogue'),
  );
  panel.webview.onDidReceiveMessage(async (message: FromAssetCataloguePage) => {
    if (message?.kind === 'ready') {
      post(toSyncMessage(uri, findings));
    } else if (message?.kind === 'open') {
      const uri = findFileUri(findings, message.group, message.id);

      if (uri) {
        await commands.executeCommand('vscode.open', uri, ViewColumn.Beside);
      }
    } else if (message?.kind === 'apply') {
      try {
        post(
          (await applySelection(uri, findings, message.selected, services)) ?? {
            kind: 'failed',
            text: 'Nothing was written.',
          },
        );
      } catch (error) {
        post({
          kind: 'failed',
          text:
            error instanceof CancellationError
              ? 'Cancelled; nothing was written.'
              : `Nothing was written: ${describeError(error)}`,
        });
      }
    }
  });
};

const pickCatalogue = async ({ archives }: Services): Promise<Uri | undefined> => {
  const items = [];

  for (const source of archives.getSources()) {
    const found = await findAssetCatalogue(source);

    if (found) {
      items.push({ label: `asset.dat of ${source.label}`, description: found.fsPath, uri: found });
    } else if (canHoldCatalogue(source)) {
      items.push({
        label: `New asset.dat in ${source.label}`,
        description: 'built from the files of this folder',
        uri: Uri.joinPath(source.baseUri, ASSET_CATALOGUE_NAME),
      });
    }
  }

  if (!items.length) {
    void window.showInformationMessage(
      'No asset.dat to sync: open a game install or a mod folder first.',
    );
    return undefined;
  }

  return (await window.showQuickPick(items, { title: 'Sync with Assets', placeHolder: 'Catalogue to compare with the game\'s files' }))?.uri;
};

export const syncAssetCatalogue = async (
  services: Services,
  extensionUri: Uri,
  given?: Uri,
): Promise<void> => {
  const uri = given ?? (await pickCatalogue(services));

  if (!uri) {
    return;
  }

  let findings: SyncFindings;

  try {
    findings = await window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: `Comparing ${ASSET_CATALOGUE_NAME} with the game's files`,
        cancellable: true,
      },
      (progress, token) => findDifferences(uri, services, progress, token),
    );
  } catch (error) {
    if (error instanceof CancellationError) {
      return;
    }
    throw error;
  }

  showSyncPanel(uri, findings, services, extensionUri);
};
