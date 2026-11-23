import * as assert from 'assert';
import { mkdir, mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import type { FolderRow } from '../../services/archives/explorerRow';
import { requireWithVscode } from './requireWithVscode';

type FakeUri = { scheme: 'file'; fsPath: string; path: string };

const toUri = (fsPath: string): FakeUri => ({ scheme: 'file', fsPath, path: fsPath.replace(/\\/g, '/') });
const warnings: string[] = [];
const copies: string[] = [];
let typedName = '';
let validation: string | undefined;

const fakeVscode = {
  Uri: {
    file: toUri,
    joinPath: (base: FakeUri, ...parts: string[]) => toUri(path.join(base.fsPath, ...parts)),
  },
  WorkspaceEdit: class {},
  FileSystemError: { NoPermissions: (message: string) => new Error(message) },
  window: {
    showWarningMessage: (message: string) => void warnings.push(message),
    showInformationMessage: () => undefined,
    showErrorMessage: () => undefined,
    showInputBox: async (options: { validateInput: (value: string) => string | undefined }) => {
      validation = options.validateInput(typedName);
      return validation ? undefined : typedName;
    },
  },
  workspace: {
    fs: {
      readDirectory: async (folder: FakeUri) =>
        (await readdir(folder.fsPath).catch(() => [])).map((name) => [name, 1]),
      copy: async (_from: FakeUri, to: FakeUri) => void copies.push(path.basename(to.fsPath)),
    },
  },
};

/* eslint-disable @typescript-eslint/no-require-imports */
const { actions, policies } = requireWithVscode(fakeVscode, () => ({
  actions: require('../../features/explorer/archiveFileActions') as typeof import('../../features/explorer/archiveFileActions'),
  policies: require('../../services/archives/archivePolicy') as typeof import('../../services/archives/archivePolicy'),
}));
/* eslint-enable @typescript-eslint/no-require-imports */

suite('New Archive and dropped archives', () => {
  let install: string;
  let isProtecting: boolean;
  let model: ArchiveModel;
  const row = (folder: string): FolderRow => ({ kind: 'folder', sourceId: 'game', path: folder, name: folder });

  setup(async () => {
    install = await mkdtemp(path.join(tmpdir(), 'bigfs-actions-'));
    isProtecting = true;
    warnings.length = 0;
    copies.length = 0;
    validation = undefined;

    const sources = [
      { id: 'game', kind: 'bfme2', external: false, baseUri: toUri(install) } as unknown as ArchiveSource,
    ];
    const policy = policies.createArchivePolicy(() => sources, () => isProtecting);

    model = {
      getSources: () => sources,
      isSourceReadOnly: policy.isReadOnly,
      isReadOnly: policy.isArchiveReadOnly,
    } as unknown as ArchiveModel;
  });

  teardown(() => rm(install, { recursive: true, force: true }));

  test("a new archive in a folder of the game's own is refused while they are protected", async () => {
    await mkdir(path.join(install, 'lang'));
    typedName = 'mymod';
    await actions.createArchive(model, row('lang'));

    assert.match(validation ?? '', /mymod\.big.*bigfs\.protectGameArchives/s);
    assert.deepStrictEqual(await readdir(path.join(install, 'lang')), []);
  });

  test('a mod name in the root is created, and a game name once protection is off', async () => {
    typedName = 'MyMod';
    await actions.createArchive(model, { kind: 'source', source: model.getSources()[0] } as never);
    typedName = 'data2';
    await actions.createArchive(model, { kind: 'source', source: model.getSources()[0] } as never);
    assert.match(validation ?? '', /protectGameArchives/);

    isProtecting = false;
    await actions.createArchive(model, { kind: 'source', source: model.getSources()[0] } as never);
    assert.deepStrictEqual((await readdir(install)).sort(), ['MyMod.big', 'data2.big']);
  });

  test("a dropped archive named as one of the game's is not copied while they are protected", async () => {
    const dropped = ['data2.big', 'mymod.big'].map((name) => toUri(path.join(tmpdir(), name)));
    const source = { kind: 'source', source: model.getSources()[0] } as never;

    assert.strictEqual(await actions.copyArchivesInto(model, source, dropped as never), 1);
    assert.deepStrictEqual(copies, ['mymod.big']);
    assert.match(warnings[0], /data2\.big.*bigfs\.protectGameArchives.*not copied/s);
  });
});
