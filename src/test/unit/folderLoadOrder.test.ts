import * as assert from 'assert';
import type { LogOutputChannel, Uri } from 'vscode';
import { compareLoadPositions } from '../../game/install/gameView';
import { buildStacks } from '../../game/install/installLayers';
import type { InstallKind, GameId } from '../../game/install/installLayers';
import type { Archive } from '../../services/archives/archive';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import type { VirtualNode } from '../../services/archives/virtualNode';
import { loadSageIniSchema } from './loadSageIniSchema';
import { requireWithVscode } from './requireWithVscode';

const makeUri = (scheme: string, path: string): Uri =>
  ({
    scheme,
    path,
    fsPath: scheme === 'file' ? path : '',
    toString: () => `${scheme}:${path}`,
  }) as unknown as Uri;

const noEvent = () => ({ dispose: () => undefined });
const looseFiles = new Map<string, string[]>();

const vscodeStub = {
  FileType: { File: 1, Directory: 2 },
  ProgressLocation: { Window: 10 },
  Uri: {
    from: ({ scheme, path }: { scheme: string; path: string }) => makeUri(scheme, path),
    file: (path: string) => makeUri('file', path),
    joinPath: (base: Uri, ...parts: string[]) =>
      makeUri(base.scheme, [base.path, ...parts].join('/')),
  },
  EventEmitter: class {
    event = noEvent;
    fire(): void {}
    dispose(): void {}
  },
  window: { withProgress: (_: unknown, task: () => unknown) => task() },
  workspace: {
    createFileSystemWatcher: () => ({
      onDidChange: noEvent,
      onDidCreate: noEvent,
      onDidDelete: noEvent,
      dispose: () => undefined,
    }),
    onDidChangeTextDocument: noEvent,
    onDidCloseTextDocument: noEvent,
    textDocuments: [],
    fs: {
      readDirectory: async (folder: Uri) =>
        (looseFiles.get(folder.path) ?? []).map((name) => [name, 1]),
    },
  },
};

/* eslint-disable @typescript-eslint/no-require-imports */
const { loadOrders, indexes, libraries } = requireWithVscode(vscodeStub, () => ({
  loadOrders: require('../../services/archives/loadOrder') as typeof import('../../services/archives/loadOrder'),
  indexes: require('../../services/ini/sageIniIndex') as typeof import('../../services/ini/sageIniIndex'),
  libraries: require('../../features/apt/aptLibrary') as typeof import('../../features/apt/aptLibrary'),
}));
/* eslint-enable @typescript-eslint/no-require-imports */

const schema = loadSageIniSchema();

const makeSource = (
  id: string,
  kind: InstallKind,
  options: { base?: boolean; game?: GameId } = {},
): ArchiveSource => ({
  id,
  label: id,
  baseUri: makeUri('file', `/games/${id}`),
  kind,
  base: options.base ?? false,
  external: options.base ?? false,
  game: options.game,
});

const makeArchive = (source: ArchiveSource, pathInSource: string, entries: string[]) => {
  const rootPath = `/${source.id}/${pathInSource}`;
  const archive = {
    sourceId: source.id,
    pathInSource,
    rootPath,
    rootKey: rootPath.toLowerCase(),
  } as unknown as Archive;
  const root: VirtualNode = {
    name: pathInSource,
    type: 2,
    entryPath: '',
    archive,
    children: new Map(),
  };

  for (const entryPath of entries) {
    root.children!.set(entryPath.toLowerCase(), {
      name: entryPath,
      type: 1,
      entryPath,
      archive,
    });
  }

  return Object.assign(archive, { root });
};

const makeModel = (
  sources: ArchiveSource[],
  archives: (Archive & { root: VirtualNode })[],
) => {
  const host = {
    getSources: () => sources,
    getArchivesOf: (id: string) => archives.filter((archive) => archive.sourceId === id),
  };
  const loadOrder = new loadOrders.LoadOrder(host);

  return {
    ...host,
    loadOrder,
    whenReady: async () => undefined,
    loadArchiveOf: async () => undefined,
    onDidChangeArchive: noEvent,
    onDidScan: noEvent,
  } as unknown as ArchiveModel;
};

const entryUri = (source: ArchiveSource, pathInSource: string, entryPath: string) =>
  makeUri('bigfs', `/${source.id}/${pathInSource}/${entryPath}`);

const looseUri = (source: ArchiveSource, entryPath: string) =>
  makeUri('file', `${source.baseUri.path}/${entryPath}`);

const bfme2 = makeSource('bfme2', 'bfme2');
const rotwk = makeSource('rotwk', 'rotwk');
const rotwkMod = makeSource('edain', 'mod', { game: 'rotwk' });
const bfme2Mod = makeSource('oldmod', 'mod', { game: 'bfme2' });
const sources = [rotwkMod, bfme2Mod, rotwk, bfme2];

const ids = (stack: readonly ArchiveSource[]) => stack.map((source) => source.id);

suite('Load order per folder', () => {
  test('a BFME II install never sees a ROTWK install, wherever it is listed', () => {
    const stacks = buildStacks(sources);

    assert.deepStrictEqual(ids(stacks.get(bfme2)!), ['bfme2']);
  });

  test('a ROTWK install resolves against itself, then BFME II', () => {
    assert.deepStrictEqual(ids(buildStacks(sources).get(rotwk)!), ['rotwk', 'bfme2']);
  });

  test('a mod resolves against itself and its own game, other folders left out', () => {
    const stacks = buildStacks(sources);

    assert.deepStrictEqual(ids(stacks.get(rotwkMod)!), ['edain', 'rotwk', 'bfme2']);
    assert.deepStrictEqual(ids(stacks.get(bfme2Mod)!), ['oldmod', 'bfme2']);
  });

  test('a mod with no stated game takes ROTWK when a ROTWK install is known, else BFME II', () => {
    const mod = makeSource('mod', 'mod');

    assert.deepStrictEqual(
      ids(buildStacks([mod, rotwk, bfme2]).get(mod)!),
      ['mod', 'rotwk', 'bfme2'],
    );
    assert.deepStrictEqual(ids(buildStacks([mod, bfme2]).get(mod)!), ['mod', 'bfme2']);
  });

  test('of two installs of one game, the base folder of the settings is the one beneath a mod', () => {
    const workspaceCopy = makeSource('copy', 'bfme2');
    const base = makeSource('base', 'bfme2', { base: true });

    assert.deepStrictEqual(
      ids(buildStacks([bfme2Mod, workspaceCopy, base]).get(bfme2Mod)!),
      ['oldmod', 'base'],
    );
    assert.deepStrictEqual(ids(buildStacks([workspaceCopy, base]).get(workspaceCopy)!), ['copy']);
  });

  test('loose files beat archives, and `___a.big` beats `b.big`, inside one layer', () => {
    const sorted = [
      { layer: 1 },
      { layer: 0, archive: 'b.big' },
      { layer: 0, archive: '___a.big' },
      { layer: 0 },
      { layer: 0, archive: 'Data/_b.big' },
    ].sort(compareLoadPositions);

    assert.deepStrictEqual(sorted, [
      { layer: 0 },
      { layer: 0, archive: '___a.big' },
      { layer: 0, archive: 'b.big' },
      { layer: 0, archive: 'Data/_b.big' },
      { layer: 1 },
    ]);
  });

  test('a file resolves against the stack of the folder holding it', () => {
    const model = makeModel(sources, [makeArchive(bfme2, 'INI.big', [])]);
    const { loadOrder } = model;

    assert.deepStrictEqual(ids(loadOrder.getStack(entryUri(bfme2, 'INI.big', 'data/ini/a.ini'))), ['bfme2']);
    assert.deepStrictEqual(ids(loadOrder.getStack(looseUri(rotwk, 'data/ini/a.ini'))), ['rotwk', 'bfme2']);
    assert.deepStrictEqual(ids(loadOrder.getStack(makeUri('untitled', 'Untitled-1'))), ['edain', 'rotwk', 'bfme2']);
  });

  test('a BFME II movie imports BFME II movies even when ROTWK holds the same names', async () => {
    const menuExport = (source: ArchiveSource) =>
      makeArchive(source, 'apt/MenuExport.big', ['MenuExport.apt']);
    const model = makeModel([rotwk, bfme2], [menuExport(rotwk), menuExport(bfme2)]);
    const library = new libraries.AptLibrary(model);

    try {
      const fromBfme2 = await library.locate(
        'MenuExport',
        entryUri(bfme2, 'apt/MainMenu.big', 'MainMenu.apt'),
      );
      const fromRotwk = await library.locate(
        'MenuExport',
        entryUri(rotwk, 'apt/MainMenu.big', 'MainMenu.apt'),
      );

      assert.strictEqual(fromBfme2?.uri.path, '/bfme2/apt/MenuExport.big/MenuExport.apt');
      assert.strictEqual(fromRotwk?.uri.path, '/rotwk/apt/MenuExport.big/MenuExport.apt');
    } finally {
      library.dispose();
    }
  });

  test('a movie loose at a folder root beats its archives, and ROTWK falls back to BFME II', async () => {
    looseFiles.set(bfme2.baseUri.path, ['menuexport.apt']);

    try {
      const model = makeModel(
        [rotwk, bfme2],
        [makeArchive(bfme2, 'apt/MenuExport.big', ['MenuExport.apt'])],
      );
      const library = new libraries.AptLibrary(model);
      const found = await library.locate(
        'menuexport',
        entryUri(rotwk, 'apt/MainMenu.big', 'MainMenu.apt'),
      );

      library.dispose();
      assert.strictEqual(found?.uri.path, '/games/bfme2/menuexport.apt');
    } finally {
      looseFiles.clear();
    }
  });
});

suite('INI index by load order', () => {
  const log = { error: () => undefined } as unknown as LogOutputChannel;
  const archives = [
    makeArchive(bfme2, 'INI.big', []),
    makeArchive(rotwk, 'INI.big', []),
    makeArchive(rotwk, '___patch.big', []),
    makeArchive(rotwkMod, 'mod.big', []),
  ];

  const makeIndex = (files: [Uri, string, string][]) => {
    const index = new indexes.SageIniIndex(makeModel(sources, archives), async () => schema, log);
    const reader = index as unknown as {
      indexText(uri: Uri, entryPath: string, text: string, schema: unknown): void;
    };

    for (const [uri, entryPath, text] of files) {
      reader.indexText(uri, entryPath, text, schema);
    }
    return index;
  };
  const object = (name: string) => `Object ${name}\nEnd\n`;
  const strings = (label: string, text: string) => `${label}\n"${text}"\nEND\n`;

  test('a definition resolves to the winner of the asking folder, never another folder', () => {
    const modLoose = looseUri(rotwkMod, 'data/ini/object/fighter.ini');
    const rotwkPatch = entryUri(rotwk, '___patch.big', 'data/ini/object/fighter.ini');
    const rotwkIni = entryUri(rotwk, 'INI.big', 'data/ini/object/fighter.ini');
    const bfme2Ini = entryUri(bfme2, 'INI.big', 'data/ini/object/fighter.ini');
    const index = makeIndex([
      [rotwkIni, 'data/ini/object/fighter.ini', object('Fighter')],
      [bfme2Ini, 'data/ini/object/fighter.ini', object('Fighter')],
      [modLoose, 'data/ini/object/fighter.ini', object('Fighter')],
      [rotwkPatch, 'data/ini/object/fighter.ini', object('Fighter')],
      [entryUri(rotwk, 'INI.big', 'data/ini/object/new.ini'), 'data/ini/object/new.ini', object('RotwkOnly')],
    ]);

    try {
      const winner = (from: Uri) => index.findDefinitions('Object', 'Fighter', from)[0]?.uri;

      assert.strictEqual(winner(looseUri(bfme2, 'data/ini/x.ini')), bfme2Ini);
      assert.strictEqual(winner(looseUri(rotwk, 'data/ini/x.ini')), rotwkPatch);
      assert.strictEqual(winner(looseUri(rotwkMod, 'data/ini/x.ini')), modLoose);
      assert.deepStrictEqual(
        index.findDefinitions('Object', 'Fighter', looseUri(rotwk, 'data/ini/x.ini')).map(({ uri }) => uri),
        [rotwkPatch, rotwkIni, bfme2Ini],
      );
      assert.deepStrictEqual(index.findDefinitions('Object', 'RotwkOnly', bfme2Ini), []);
      assert.strictEqual(index.findDefinitions('Object', 'Fighter').length, 4);
      assert.strictEqual(index.findDefinitions('Object', 'Fighter')[0].uri, modLoose);
    } finally {
      index.dispose();
    }
  });

  test('a string resolves to the winner of the asking folder', () => {
    const index = makeIndex([
      [entryUri(rotwk, 'INI.big', 'data/lotr.str'), 'data/lotr.str', strings('OBJECT:Fighter', 'Rotwk fighter')],
      [entryUri(bfme2, 'INI.big', 'data/lotr.str'), 'data/lotr.str', strings('OBJECT:Fighter', 'Bfme2 fighter')],
      [looseUri(rotwkMod, 'data/lotr.str'), 'data/lotr.str', strings('OBJECT:Fighter', 'Mod fighter')],
    ]);

    try {
      const text = (from: Uri) => index.findString('OBJECT:Fighter', from)?.text;

      assert.strictEqual(text(looseUri(bfme2, 'data/ini/x.ini')), 'Bfme2 fighter');
      assert.strictEqual(text(looseUri(rotwk, 'data/ini/x.ini')), 'Rotwk fighter');
      assert.strictEqual(text(looseUri(rotwkMod, 'data/ini/x.ini')), 'Mod fighter');
      assert.strictEqual(index.findString('OBJECT:Fighter')?.text, 'Mod fighter');
    } finally {
      index.dispose();
    }
  });

  test('a macro resolves to the winner of the asking folder', () => {
    const index = makeIndex([
      [entryUri(bfme2, 'INI.big', 'data/ini/gamedata.inc'), 'data/ini/gamedata.inc', '#define HEALTH 100\n'],
      [entryUri(rotwk, 'INI.big', 'data/ini/gamedata.inc'), 'data/ini/gamedata.inc', '#define HEALTH 200\n'],
    ]);

    try {
      assert.strictEqual(index.findMacro('HEALTH', looseUri(bfme2, 'a.ini'))?.value, '100');
      assert.strictEqual(index.findMacro('HEALTH', looseUri(rotwk, 'a.ini'))?.value, '200');
    } finally {
      index.dispose();
    }
  });
});
