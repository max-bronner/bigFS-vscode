import * as assert from 'assert';
import { readFileSync } from 'fs';
import path from 'path';
import { getContextValue } from '../../features/explorer/getContextValue';
import type { RowContextKind } from '../../features/explorer/getContextValue';

interface MenuItem {
  command?: string;
  submenu?: string;
  group?: string;
  when?: string;
}

interface Manifest {
  contributes: {
    commands: { command: string }[];
    submenus: { id: string; label: string }[];
    menus: Record<string, MenuItem[]>;
  };
}

const manifest = JSON.parse(
  readFileSync(path.join(__dirname, '../../../package.json'), 'utf-8'),
) as Manifest;

const { menus } = manifest.contributes;

type Context = Record<string, unknown>;
type Condition = (context: Context) => boolean;

const tokenize = (when: string): string[] => {
  const tokens: string[] = [];
  let at = 0;

  while (at < when.length) {
    const rest = when.slice(at);
    const space = /^\s+/.exec(rest);

    if (space) {
      at += space[0].length;
      continue;
    }

    if (tokens[tokens.length - 1] === '=~') {
      const regex = /^\/(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\[])*\/[a-z]*/.exec(rest);

      assert.ok(regex, `a regular expression is expected at "${rest}" in: ${when}`);
      tokens.push(regex[0]);
      at += regex[0].length;
      continue;
    }

    const operator = /^(?:&&|\|\||==|!=|=~|!|\(|\))/.exec(rest);
    const word = operator ?? /^[^\s()!=&|<>~']+/.exec(rest);

    assert.ok(word, `unexpected "${rest}" in: ${when}`);
    tokens.push(word[0]);
    at += word[0].length;
  }

  return tokens;
};

const OPERATORS = new Set(['&&', '||', '==', '!=', '=~', '!', '(', ')']);

const parseWhen = (when: string): Condition => {
  const tokens = tokenize(when);
  let index = 0;

  const peek = (): string | undefined => tokens[index];
  const take = (): string => {
    const token = tokens[index++];

    assert.ok(token !== undefined, `the clause ends early: ${when}`);

    return token;
  };
  const takeKey = (): string => {
    const key = take();

    assert.ok(!OPERATORS.has(key), `a key is expected, not "${key}", in: ${when}`);

    return key;
  };

  const parseOr = (): Condition => {
    const parts = [parseAnd()];

    while (peek() === '||') {
      take();
      parts.push(parseAnd());
    }

    return (context) => parts.some((part) => part(context));
  };

  const parseAnd = (): Condition => {
    const parts = [parseTerm()];

    while (peek() === '&&') {
      take();
      parts.push(parseTerm());
    }

    return (context) => parts.every((part) => part(context));
  };

  const parseGroup = (): Condition => {
    take();

    const inner = parseOr();

    assert.strictEqual(take(), ')', `a ) is missing in: ${when}`);

    return inner;
  };

  const parseTerm = (): Condition => {
    if (peek() === '!') {
      take();

      if (peek() === '(') {
        const inner = parseGroup();

        return (context) => !inner(context);
      }

      const key = takeKey();

      return (context) => !context[key];
    }

    if (peek() === '(') {
      return parseGroup();
    }

    const key = takeKey();
    const operator = peek();

    if (operator === '==' || operator === '!=') {
      take();

      const operand = takeKey();

      return (context) =>
        (String(context[key]) === operand) === (operator === '==');
    }

    if (operator === 'in') {
      take();

      const list = takeKey();

      return (context) => {
        const values = context[list];

        return Array.isArray(values) && values.includes(context[key]);
      };
    }

    if (operator === '=~') {
      take();

      const [, pattern, flags] = /^\/(.*)\/([a-z]*)$/.exec(take()) ?? [];
      const regex = new RegExp(pattern, flags);

      return (context) => regex.test(String(context[key]));
    }

    return (context) => Boolean(context[key]);
  };

  const condition = parseOr();

  assert.strictEqual(index, tokens.length, `"${peek()}" is not expected in: ${when}`);

  return condition;
};

const isShown = (item: MenuItem, context: Context): boolean =>
  item.when === undefined || parseWhen(item.when)(context);

const listMenu = (
  menu: string,
  context: Context,
): { command: string; submenu?: string }[] =>
  (menus[menu] ?? [])
    .filter((item) => isShown(item, context))
    .flatMap((item) =>
      item.submenu
        ? listMenu(item.submenu, context).map(({ command }) => ({
            command,
            submenu: item.submenu,
          }))
        : [{ command: item.command! }],
    );

const getTreeContext = (
  kind: RowContextKind,
  isReadOnly: boolean,
  extension: string,
  leaked = extension === '.apt' ? '.tga' : '.apt',
): Context => ({
  view: 'bigArchiveExplorer',
  viewItem: getContextValue(kind, isReadOnly, extension ? `name${extension}` : undefined),
  resourceExtname: leaked,
  'bigfs.hasClipboard': true,
});

const menuFor = (
  kind: RowContextKind,
  isReadOnly: boolean,
  resourceExtname = '',
): Set<string> =>
  new Set(
    listMenu('view/item/context', getTreeContext(kind, isReadOnly, resourceExtname)).map(
      ({ command }) => command,
    ),
  );

const placesFor = (
  kind: RowContextKind,
  isReadOnly: boolean,
  resourceExtname = '',
): Map<string, string> =>
  new Map(
    listMenu('view/item/context', getTreeContext(kind, isReadOnly, resourceExtname)).map(
      ({ command, submenu }) => [command, submenu ?? 'top'],
    ),
  );

const explorerMenuFor = (resourceExtname: string, isFolder = false): Set<string> =>
  new Set(
    listMenu('explorer/context', {
      resourceExtname,
      explorerResourceIsFolder: isFolder,
    }).map(({ command }) => command),
  );

const EDITS = [
  'bigfs.newFile',
  'bigfs.newFolder',
  'bigfs.addFiles',
  'bigfs.paste',
  'bigfs.cut',
  'bigfs.duplicate',
  'bigfs.rename',
  'bigfs.delete',
];

const WRITES = [
  ...EDITS,
  'bigfs.newArchive',
  'bigfs.importImage',
  'bigfs.convertPng',
  'bigfs.convertToVp6',
  'bigfs.convertStringTable',
  'bigfs.newAptMovie',
  'bigfs.renameAptMovie',
  'bigfs.deleteAptMovie',
  'bigfs.editW3dAnimation',
];

const KINDS: RowContextKind[] = [
  'source',
  'diskFolder',
  'archive',
  'folder',
  'file',
  'gameFolder',
  'looseFile',
];

const EXTENSIONS = ['', '.big', '.tga', '.dds', '.png', '.cur', '.ani', '.mp4', '.str', '.csf', '.apt', '.w3d', '.ini', '.wav'];

const LENS_ONLY = new Set(['bigfs.editCommandSet']);

const hasAll = (menu: Set<string>, commands: string[]): void =>
  commands.forEach((command) => assert.ok(menu.has(command), `${command} is missing`));

const hasNone = (menu: Set<string>, commands: string[]): void =>
  commands.forEach((command) => assert.ok(!menu.has(command), `${command} must not show`));

suite('Explorer menus', () => {
  test('a source and a folder on disk offer a new archive, and only when writable', () => {
    for (const kind of ['source', 'diskFolder'] as const) {
      hasAll(menuFor(kind, false), ['bigfs.newArchive']);
      hasNone(menuFor(kind, true), ['bigfs.newArchive']);
      hasNone(menuFor(kind, false), EDITS);
    }
  });

  test('a writable archive offers new files and folders, adding, pasting, renaming and deleting', () => {
    const menu = menuFor('archive', false);

    hasAll(menu, [
      'bigfs.newFile',
      'bigfs.newFolder',
      'bigfs.addFiles',
      'bigfs.paste',
      'bigfs.extract',
      'bigfs.rename',
      'bigfs.delete',
      'bigfs.copyPath',
      'bigfs.newAptMovie',
    ]);
    hasNone(menu, ['bigfs.cut', 'bigfs.duplicate']);
  });

  test('a writable folder and file offer every edit that fits them', () => {
    hasAll(menuFor('folder', false), [...EDITS, 'bigfs.extract', 'bigfs.copy', 'bigfs.copyPath']);
    hasAll(menuFor('file', false), [
      'bigfs.cut',
      'bigfs.copy',
      'bigfs.duplicate',
      'bigfs.rename',
      'bigfs.delete',
      'bigfs.extract',
    ]);
    hasNone(menuFor('file', false), ['bigfs.newFile', 'bigfs.paste', 'bigfs.addFiles']);
  });

  test('every file has the same shared part, whatever its kind', () => {
    const shared = [
      'bigfs.extract',
      'bigfs.overrideInFolder',
      'bigfs.cut',
      'bigfs.copy',
      'bigfs.duplicate',
      'bigfs.copyPath',
      'bigfs.copyRelativePath',
      'bigfs.rename',
      'bigfs.delete',
    ];

    for (const extension of EXTENSIONS) {
      const places = placesFor('file', false, extension);

      shared.forEach((command) =>
        assert.strictEqual(places.get(command), 'top', `${command} on ${extension}`),
      );
    }
  });

  test('a read-only row keeps everything that only reads', () => {
    for (const kind of ['archive', 'folder', 'file'] as const) {
      const menu = menuFor(kind, true);

      hasAll(menu, ['bigfs.extract', 'bigfs.copyPath']);
      hasNone(menu, EDITS);
    }

    hasAll(menuFor('folder', true), ['bigfs.copy', 'bigfs.overrideInFolder']);
    hasAll(menuFor('file', true), ['bigfs.copy', 'bigfs.overrideInFolder']);
    hasAll(menuFor('file', true, '.tga'), ['bigfs.exportPng']);
    hasAll(menuFor('file', true, '.cur'), ['bigfs.exportCursorPng']);
    hasAll(menuFor('file', true, '.apt'), ['bigfs.openAptText']);
  });

  test('no read-only row of any kind offers a command that writes', () => {
    for (const kind of KINDS) {
      for (const extension of EXTENSIONS) {
        hasNone(menuFor(kind, true, extension), WRITES);
      }
    }
  });

  test('a game view folder can be extracted and overridden', () => {
    hasAll(menuFor('gameFolder', false), ['bigfs.extract', 'bigfs.overrideInFolder']);
    hasNone(menuFor('gameFolder', false), EDITS);
  });

  test('a loose file exports a texture beside it only when it is writable', () => {
    hasNone(menuFor('looseFile', true, '.tga'), ['bigfs.exportPng']);
    hasAll(menuFor('looseFile', false, '.tga'), ['bigfs.exportPng', 'bigfs.importImage']);
  });

  test('each kind of file finds its actions in a submenu named after it', () => {
    const expected: [string, string, string[]][] = [
      ['.tga', 'bigfs.textureActions', ['bigfs.exportPng', 'bigfs.importImage']],
      ['.dds', 'bigfs.textureActions', ['bigfs.exportPng', 'bigfs.importImage']],
      ['.png', 'bigfs.textureActions', ['bigfs.convertPng']],
      ['.png', 'bigfs.cursorActions', ['bigfs.convertPngToCursor']],
      ['.cur', 'bigfs.cursorActions', ['bigfs.exportCursorPng']],
      ['.ani', 'bigfs.cursorActions', ['bigfs.exportCursorPng']],
      ['.mp4', 'bigfs.movieActions', ['bigfs.convertToVp6']],
      ['.str', 'bigfs.stringTableActions', ['bigfs.convertStringTable']],
      ['.csf', 'bigfs.stringTableActions', ['bigfs.convertStringTable']],
      ['.apt', 'bigfs.aptMovieActions', ['bigfs.openAptText', 'bigfs.renameAptMovie', 'bigfs.deleteAptMovie']],
      ['.w3d', 'bigfs.modelActions', ['bigfs.editW3dAnimation']],
    ];

    for (const [extension, submenu, commands] of expected) {
      const places = placesFor('file', false, extension);

      commands.forEach((command) =>
        assert.strictEqual(places.get(command), submenu, `${command} on ${extension}`),
      );
    }

    assert.strictEqual(placesFor('folder', false).get('bigfs.newAptMovie'), 'bigfs.aptMovieActions');
  });

  test('a file of no kind bigFS knows shows no kind submenu', () => {
    for (const extension of ['.ini', '.wav', '']) {
      const submenus = [...placesFor('file', false, extension).values()].filter(
        (place) => place !== 'top',
      );

      assert.deepStrictEqual(submenus, [], extension);
    }
  });

  test('a row\'s kind comes from the row, never from the active editor', () => {
    for (const leaked of EXTENSIONS) {
      const submenus = listMenu('view/item/context', getTreeContext('file', false, '.ini', leaked))
        .flatMap(({ submenu }) => (submenu ? [submenu] : []));

      assert.deepStrictEqual(submenus, [], `an editor on a ${leaked} file`);
    }

    assert.strictEqual(getContextValue('file', true, 'Shot.TGA'), 'bigFileReadOnly:tga');
    assert.strictEqual(getContextValue('looseFile', false, 'readme'), 'bigLooseFile');
    assert.strictEqual(getContextValue('archive', false), 'bigArchive');
  });

  test('VS Code\'s explorer offers the same kind submenus and the mod folder actions', () => {
    hasAll(explorerMenuFor('.png'), [
      'bigfs.convertPng',
      'bigfs.convertPngToCursor',
      'bigfs.buildAnimatedCursor',
      'bigfs.convertToVp6',
    ]);
    hasAll(explorerMenuFor('.tga'), ['bigfs.exportPng', 'bigfs.importImage', 'bigfs.buildAnimatedCursor']);
    hasAll(explorerMenuFor('.apt'), ['bigfs.openAptText', 'bigfs.renameAptMovie', 'bigfs.deleteAptMovie']);
    hasAll(explorerMenuFor('.str'), ['bigfs.convertStringTable']);
    hasAll(explorerMenuFor('.w3d'), ['bigfs.editW3dAnimation']);
    hasAll(explorerMenuFor('', true), [
      'bigfs.packFolder',
      'bigfs.launchGame',
      'bigfs.newAptMovie',
      'bigfs.convertToVp6',
    ]);
    hasNone(explorerMenuFor('.ini'), [...WRITES, 'bigfs.packFolder']);
    hasNone(menuFor('file', false, '.png'), ['bigfs.buildAnimatedCursor']);
  });

  test('an INI or INC file, and no other, can be compared with another version', () => {
    const compare = ['bigfs.compareWithOtherVersion'];

    for (const extension of ['.ini', '.inc']) {
      hasAll(menuFor('file', true, extension), compare);
      hasAll(menuFor('looseFile', false, extension), compare);
      hasAll(explorerMenuFor(extension), compare);
      hasAll(new Set(listMenu('editor/title/context', { resourceExtname: extension }).map(({ command }) => command)), compare);
    }

    hasAll(new Set(listMenu('editor/context', { editorLangId: 'sage-ini' }).map(({ command }) => command)), compare);
    hasNone(menuFor('file', false, '.tga'), compare);
    hasNone(menuFor('folder', false), compare);
    hasNone(explorerMenuFor('.tga'), compare);
    hasNone(new Set(listMenu('editor/title/context', { resourceExtname: '.tga' }).map(({ command }) => command)), compare);
  });

  test('the tree\'s title bar keeps its buttons and holds the mod-wide tasks behind "…"', () => {
    const titleBar = (menus['view/title'] ?? []).filter((item) =>
      isShown(item, { view: 'bigArchiveExplorer', 'bigfs.gameView': false }),
    );
    const buttons = titleBar
      .filter((item) => item.group?.startsWith('navigation'))
      .map((item) => item.command);
    const more = new Set(
      titleBar
        .filter((item) => !item.group?.startsWith('navigation'))
        .map((item) => item.command!),
    );

    assert.deepStrictEqual(buttons.sort(), ['bigfs.refreshArchives', 'bigfs.showGameView']);
    hasAll(more, [
      'bigfs.searchArchives',
      'bigfs.goToFile',
      'bigfs.validateIni',
      'bigfs.findUnusedDefinitions',
      'bigfs.checkTranslations',
      'bigfs.compareWithBaseGame',
      'bigfs.syncAssetCatalogue',
      'bigfs.packageMod',
      'bigfs.launchGame',
      'bigfs.findGameInstalls',
      'bigfs.chooseLanguage',
    ]);
    assert.ok(
      titleBar.every((item) => item.when?.includes('view == bigArchiveExplorer')),
      'an item would show on every view\'s title bar',
    );
  });

  test('the INI editor\'s menu holds bigFS\'s items in one bigFS submenu', () => {
    const top = (menus['editor/context'] ?? []).filter((item) =>
      isShown(item, { editorLangId: 'sage-ini' }),
    );
    const iniMenu = new Set(listMenu('editor/context', { editorLangId: 'sage-ini' }).map(({ command }) => command));

    assert.deepStrictEqual(top.map((item) => item.submenu), ['bigfs.iniActions']);
    assert.strictEqual(
      manifest.contributes.submenus.find(({ id }) => id === 'bigfs.iniActions')?.label,
      'bigFS',
    );
    hasAll(iniMenu, [
      'bigfs.previewObject',
      'bigfs.previewParticles',
      'bigfs.showEffectiveObject',
      'bigfs.newObject',
      'bigfs.newParticleSystem',
      'bigfs.duplicateDefinition',
      'bigfs.bulkEditIni',
    ]);
    assert.deepStrictEqual(listMenu('editor/context', { editorLangId: 'sage-str' }), []);
  });

  test('every when clause parses as VS Code reads it', () => {
    for (const [menu, items] of Object.entries(menus)) {
      for (const item of items) {
        if (item.when !== undefined) {
          assert.doesNotThrow(() => parseWhen(item.when!), `${menu}: ${item.when}`);
        }
      }
    }
  });

  test('the when clause parser rejects what VS Code rejects', () => {
    assert.throws(() => parseWhen('viewItem !~ /ReadOnly$/'));
    assert.throws(() => parseWhen('a &&'));
    assert.throws(() => parseWhen('(a || b'));
    assert.ok(parseWhen('!(viewItem =~ /ReadOnly$/)')({ viewItem: 'bigFile' }));
    assert.ok(!parseWhen('!(viewItem =~ /ReadOnly$/)')({ viewItem: 'bigFileReadOnly' }));
    assert.ok(parseWhen('a && b || c')({ c: true }));
    assert.ok(parseWhen('a in list')({ a: 'x', list: ['x'] }));
    assert.ok(!parseWhen('a in list')({ a: 'y', list: ['x'] }));
  });

  test('Restore Original asset.dat shows on an asset.dat with its original kept, and only there', () => {
    const restore = 'bigfs.restoreAssetCatalogue';
    const row = (isReadOnly: boolean, name: string, hasOriginal: boolean) =>
      listMenu('view/item/context', {
        view: 'bigArchiveExplorer',
        viewItem: getContextValue('looseFile', isReadOnly, name, hasOriginal),
      }).some(({ command }) => command === restore);
    const explorer = (resourcePath: string, restorable: string[]) =>
      listMenu('explorer/context', {
        resourceFilename: path.basename(resourcePath),
        resourcePath,
        'bigfs.restorableAssetCatalogues': restorable,
      }).some(({ command }) => command === restore);

    assert.ok(row(false, 'asset.dat', true));
    assert.ok(!row(false, 'asset.dat', false));
    assert.ok(!row(true, 'asset.dat', true), 'a game install outside the workspace is never written');
    assert.ok(explorer('/mod/Asset.dat', ['/mod/Asset.dat']));
    assert.ok(!explorer('/mod/asset.dat', ['/other/asset.dat']));
  });

  test('every submenu is declared, used and holds something', () => {
    const declared = new Set(manifest.contributes.submenus.map(({ id }) => id));
    const used = new Set(
      Object.values(menus)
        .flat()
        .flatMap((item) => (item.submenu ? [item.submenu] : [])),
    );

    assert.deepStrictEqual([...used].sort(), [...declared].sort());
    declared.forEach((id) => assert.ok(menus[id]?.length, `${id} is empty`));
  });

  test('every command a menu names is contributed', () => {
    const contributed = new Set(
      manifest.contributes.commands.map((entry) => entry.command),
    );

    for (const item of Object.values(menus).flat()) {
      if (item.command) {
        assert.ok(contributed.has(item.command), item.command);
      }
    }
  });

  test('every command is in a menu or the Command Palette', () => {
    const hiddenFromPalette = new Set(
      menus.commandPalette
        .filter((item) => item.when === 'false')
        .map((item) => item.command),
    );
    const inMenus = new Set(
      Object.entries(menus)
        .filter(([menu]) => menu !== 'commandPalette')
        .flatMap(([, items]) => items.map((item) => item.command)),
    );

    for (const { command } of manifest.contributes.commands) {
      assert.ok(
        LENS_ONLY.has(command) || inMenus.has(command) || !hiddenFromPalette.has(command),
        `${command} cannot be reached`,
      );
    }
  });
});
