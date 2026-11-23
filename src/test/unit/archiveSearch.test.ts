import * as assert from 'assert';
import { buildSearchPattern } from '../../core/buildSearchPattern';
import { collectLineMatches } from '../../core/collectLineMatches';
import { compilePathFilter } from '../../core/compilePathFilter';
import { createFrameQueue } from '../../core/createFrameQueue';
import { looksBinary } from '../../core/looksBinary';
import { createListScanner } from '../../node/createListScanner';
import { createMatchScanner } from '../../node/createMatchScanner';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { VirtualNode } from '../../services/archives/virtualNode';
import type { FileResult, SearchRequest, ToSearchPage } from '../../webview/archiveSearch/protocol';
import { DEFAULT_SEARCH_STATE, readSearchState } from '../../webview/archiveSearch/readSearchState';
import { requireWithVscode } from './requireWithVscode';

const fakeVscode = {
  FileType: { File: 1, Directory: 2 },
  Uri: { from: ({ scheme, path }: { scheme: string; path: string }) => ({ toString: () => `${scheme}:${path}` }) },
};

/* eslint-disable @typescript-eslint/no-require-imports */
const { search, trees } = requireWithVscode(fakeVscode, () => ({
  search: require('../../features/archiveSearch/runArchiveSearch') as typeof import('../../features/archiveSearch/runArchiveSearch'),
  trees: require('../../services/archives/virtualTree') as typeof import('../../services/archives/virtualTree'),
}));
/* eslint-enable @typescript-eslint/no-require-imports */

const createArchives = (archives: Record<string, string[]>): ArchiveModel => {
  const roots = Object.entries(archives).map(([name, entryPaths]) => {
    const archive = { name, pathInSource: `mods/${name}`, rootPath: `/workspace/mods/${name}` };

    return trees.buildVirtualTree(archive, entryPaths) as unknown as VirtualNode;
  });

  return {
    getArchiveRoots: () => roots,
    loadArchiveOf: async () => undefined,
    readFiles: async () => assert.fail('a file name search reads nothing'),
  } as unknown as ArchiveModel;
};

const searchNames = async (archives: ArchiveModel, text: string, include = '', exclude = '', regex = false) => {
  const messages: ToSearchPage[] = [];
  const request: SearchRequest = {
    query: { text, caseSensitive: false, wholeWord: false, regex },
    target: 'names',
    include,
    exclude,
    contextLines: 2,
  };

  await search.runArchiveSearch(archives, 1, request, { post: (message) => messages.push(message), isCancelled: () => false });

  const files = messages.flatMap((message) => (message.kind === 'files' ? message.files : [])) as FileResult[];
  const finished = messages.find((message) => message.kind === 'finished');

  assert.ok(finished && finished.kind === 'finished');
  return { files, summary: finished.summary };
};

suite('Archive text search', () => {
  test('a literal query is escaped and honours whole word and casing', () => {
    const pattern = buildSearchPattern({
      text: 'a.b',
      caseSensitive: false,
      wholeWord: true,
      regex: false,
    });

    assert.ok('source' in pattern);
    assert.strictEqual(pattern.flags, 'gim');
    assert.ok(new RegExp(pattern.source, pattern.flags).test('x A.B y'));
    assert.ok(!new RegExp(pattern.source, pattern.flags).test('xa.by'));
    assert.ok(!new RegExp(pattern.source, pattern.flags).test('x aXb y'));
  });

  test('a broken regular expression is reported, not thrown', () => {
    const pattern = buildSearchPattern({
      text: '(unclosed',
      caseSensitive: false,
      wholeWord: false,
      regex: true,
    });

    assert.ok('error' in pattern);
    assert.ok(pattern.error.length > 0);
  });

  test('the path filter reads include and exclude boxes like VS Code', () => {
    const accepts = compilePathFilter('*.ini, data/lang', 'data/ini/skip/**');

    assert.ok(accepts('data/ini/object.ini', 'ini.big'));
    assert.ok(accepts('Data/Lang/english/x.txt', 'lang.big'));
    assert.ok(!accepts('data/ini/skip/a.ini', 'ini.big'));
    assert.ok(!accepts('art/readme.txt', 'art.big'));
    assert.ok(compilePathFilter('', '')('anything/at/all.txt', 'a.big'));
    assert.ok(compilePathFilter('ini.big/data', '')('data/a.ini', 'INI.big'));
    assert.ok(compilePathFilter('*.{ini,inc}', '')('data/a.inc', 'a.big'));
  });

  test('text is told from binary by a zero byte near the start', () => {
    assert.ok(!looksBinary(Uint8Array.from([0x41, 0x42, 0x0d, 0x0a])));
    assert.ok(looksBinary(Uint8Array.from([0x41, 0, 0x42])));
  });

  test('matches become lines with context, merged where they touch', () => {
    const text = [
      'a',
      'b',
      'needle',
      'c',
      'needle two needle',
      'd',
      'e',
      'f',
      'g',
      'needle',
    ].join('\r\n');
    const scanner = createMatchScanner('needle', 'g', 1000);
    const { matches } = scanner(text, 100);
    const { blocks, matchCount } = collectLineMatches(text, matches, 1);

    assert.strictEqual(matchCount, 4);
    assert.strictEqual(blocks.length, 2);
    assert.deepStrictEqual(
      blocks[0].lines.map((line) => line.line),
      [1, 2, 3, 4, 5],
    );
    assert.deepStrictEqual(blocks[0].lines[4].ranges, undefined);
    assert.deepStrictEqual(blocks[0].lines[3].ranges, [
      [0, 6],
      [11, 17],
    ]);
    assert.deepStrictEqual(blocks[0].lines[3].selection, [0, 6]);
    assert.strictEqual(blocks[0].lines[2].text, 'c');
    assert.deepStrictEqual(
      blocks[1].lines.map((line) => line.line),
      [8, 9],
    );
  });

  test('a file name search makes each matching path one line with its matches highlighted', () => {
    const pattern = buildSearchPattern({ text: 'skn', caseSensitive: false, wholeWord: false, regex: false });

    assert.ok('source' in pattern);

    const scan = createMatchScanner(pattern.source, pattern.flags, 1000);
    const path = 'art\\w3d\\mu\\MUCorBnr_SKN.w3d';
    const { blocks, matchCount } = collectLineMatches(path, scan(path, 500).matches, 0);

    assert.strictEqual(matchCount, 1);
    assert.deepStrictEqual(
      blocks.map((block) => block.lines.map(({ line, text, ranges }) => ({ line, text, ranges }))),
      [[{ line: 0, text: path, ranges: [[20, 23]] }]],
    );
    assert.deepStrictEqual(scan('art\\w3d\\mu\\mucorbnr_wala.w3d', 500).matches, []);
  });

  test('a long line is cut around its match and keeps the highlight', () => {
    const text = `${'x'.repeat(500)}needle${'y'.repeat(500)}`;
    const { matches } = createMatchScanner('needle', 'g', 1000)(text, 10);
    const [line] = collectLineMatches(text, matches, 0).blocks[0].lines;
    const [start, end] = line.ranges![0];

    assert.ok(line.text.length < 300);
    assert.strictEqual(line.text.slice(start, end), 'needle');
    assert.deepStrictEqual(line.selection, [500, 506]);
  });

  test('a pattern that backtracks without end is stopped and reported', () => {
    const scanner = createMatchScanner('(a+)+$', 'g', 100);
    const started = Date.now();
    const result = scanner(`${'a'.repeat(60)}b`, 10);

    assert.ok(result.timedOut);
    assert.ok(Date.now() - started < 3000);
    assert.deepStrictEqual(scanner('aaa', 10).matches, [0, 3]);
  });

  test('a scan stops at the match limit and skips empty matches', () => {
    const scanner = createMatchScanner('x*', 'g', 1000);

    assert.deepStrictEqual(scanner('axxbx', 10).matches, [1, 2, 4, 1]);
    assert.strictEqual(
      createMatchScanner('a', 'g', 1000)('aaaa', 2).matches.length,
      4,
    );
  });

  test('a file name search finds paths in every archive, each one row with its archive and folder', async () => {
    const archives = createArchives({
      'w3d.big': ['art/w3d/mu/MUCorBnr_SKN.w3d', 'art/w3d/mu/MUCorBnr_SKL.w3d'],
      'ini.big': ['data/ini/object/skn_units.ini', 'data/ini/weapon.ini'],
    });
    const { files, summary } = await searchNames(archives, 'skn');

    assert.deepStrictEqual(
      files.map(({ archive, archiveFolder, entryPath, isNameMatch, matchCount, blocks }) => [
        archive,
        archiveFolder,
        entryPath,
        isNameMatch,
        matchCount,
        blocks.map((block) => block.lines.map(({ line, text }) => [line, text])),
      ]),
      [
        ['w3d.big', 'mods/', 'art/w3d/mu/MUCorBnr_SKN.w3d', true, 1, [[[0, 'art/w3d/mu/MUCorBnr_SKN.w3d']]]],
        ['ini.big', 'mods/', 'data/ini/object/skn_units.ini', true, 1, [[[0, 'data/ini/object/skn_units.ini']]]],
      ],
    );
    assert.strictEqual(files[0].uri, 'bigfs:/workspace/mods/w3d.big/art/w3d/mu/MUCorBnr_SKN.w3d');
    assert.deepStrictEqual([summary.fileCount, summary.matchCount, summary.searchedCount], [2, 2, 4]);
  });

  test('the include and exclude boxes narrow a file name search, and only what passes is searched', async () => {
    const archives = createArchives({
      'w3d.big': ['art/w3d/mu/MUCorBnr_SKN.w3d', 'art/w3d/gu/GUWorker_SKN.w3d'],
      'ini.big': ['data/ini/object/skn_units.ini'],
    });
    const { files, summary } = await searchNames(archives, 'skn', '*.w3d', 'art/w3d/gu/**');

    assert.deepStrictEqual(files.map((file) => file.entryPath), ['art/w3d/mu/MUCorBnr_SKN.w3d']);
    assert.strictEqual(summary.searchedCount, 1);
  });

  test('a file name search stops at the match limit', async () => {
    const paths = Array.from({ length: 20 }, (_, at) => `${'a'.repeat(400)}/${at}.txt`);
    const { files, summary } = await searchNames(createArchives({ 'many.big': paths, 'later.big': paths }), 'a');

    const entriesToLimit = Math.ceil(search.MATCH_LIMIT / 400);

    assert.ok(summary.isLimitHit);
    assert.strictEqual(files.length, entriesToLimit);
    assert.strictEqual(summary.matchCount, entriesToLimit * 400);
    assert.ok(files.every((file) => file.archive === 'many.big'));
  });

  test('a scanner without a time limit finds what the sandboxed one finds', () => {
    const text = 'Gondor gondor\nxx GONDOR\n';

    for (const [source, flags] of [['gondor', 'gim'], ['\bgondor\b', 'gm'], ['x*', 'g']]) {
      assert.deepStrictEqual(
        createMatchScanner(source, flags)(text, 2),
        createMatchScanner(source, flags, 1000)(text, 2),
        source,
      );
    }
  });

  test('a list scanner matches each text in one call, with the text index before each match', () => {
    const texts = ['art/a_skn.w3d', 'data/ini/weapon.ini', 'skn/skn/skn.skn'];

    for (const scanner of [createListScanner('skn', 'gi', 1000), createListScanner('skn', 'gi')]) {
      assert.deepStrictEqual(scanner(texts, 10, 100), {
        matches: [0, 6, 3, 2, 0, 3, 2, 4, 3, 2, 8, 3, 2, 12, 3],
        timedOut: false,
      });
      assert.deepStrictEqual(scanner(texts, 2, 3).matches, [0, 6, 3, 2, 0, 3, 2, 4, 3]);
      assert.deepStrictEqual(scanner(['', 'none'], 10, 100).matches, []);
    }

    assert.deepStrictEqual(createListScanner('x*', 'g')(['axx', 'x'], 10, 100).matches, [0, 1, 2, 1, 0, 1]);
  });

  test('a list scanner gives up on a list a pattern backtracks on, and says so', () => {
    const scanner = createListScanner('(a+)+$', 'g', 100);
    const started = Date.now();
    const result = scanner(['aaa', `${'a'.repeat(60)}b`], 10, 100);

    assert.ok(result.timedOut);
    assert.deepStrictEqual(result.matches, []);
    assert.ok(Date.now() - started < 3000);
  });

  test('a frame queue draws what fits the budget each frame, at least one item, and drops what is cleared', () => {
    const drawn: number[] = [];
    const frames: (() => void)[] = [];
    let clock = 0;
    const queue = createFrameQueue<number>({
      render: (item) => {
        drawn.push(item);
        clock += 3;
      },
      budgetMilliseconds: 8,
      requestFrame: (callback) => frames.push(callback),
      now: () => clock,
    });

    queue.push([1, 2, 3, 4, 5]);
    queue.push([6, 7]);
    assert.strictEqual(frames.length, 1, 'one frame asked for, however often items arrive');
    assert.strictEqual(drawn.length, 0);

    frames.shift()!();
    assert.deepStrictEqual(drawn, [1, 2, 3]);
    assert.strictEqual(queue.size, 4);

    frames.shift()!();
    assert.deepStrictEqual(drawn, [1, 2, 3, 4, 5, 6]);

    queue.clear();
    frames.shift()!();
    assert.strictEqual(frames.length > 0, false, 'no frame asked for once nothing waits');
    assert.strictEqual(frames.length, 0);

    const slow = createFrameQueue<number>({
      render: (item) => {
        drawn.push(item);
        clock += 100;
      },
      budgetMilliseconds: 8,
      requestFrame: (callback) => frames.push(callback),
      now: () => clock,
    });

    slow.push([8, 9]);
    frames.shift()!();
    assert.deepStrictEqual(drawn.slice(-1), [8]);
    frames.shift()!();
    assert.deepStrictEqual(drawn.slice(-2), [8, 9]);
    assert.strictEqual(slow.size, 0);
  });

  test('a file name search, plain or by regular expression, reaches past the first chunk of a large archive', async () => {
    const paths = Array.from({ length: 10000 }, (_, at) => `art/w3d/unit${at}.w3d`);
    const archives = createArchives({ 'w3d.big': paths });
    const literal = await searchNames(archives, 'unit9999.');
    const regex = await searchNames(archives, '^art/w3d/unit9999\.w3d$', '', '', true);

    for (const { files, summary } of [literal, regex]) {
      assert.deepStrictEqual(files.map((file) => file.entryPath), ['art/w3d/unit9999.w3d']);
      assert.strictEqual(files[0].uri, 'bigfs:/workspace/mods/w3d.big/art/w3d/unit9999.w3d');
      assert.strictEqual(summary.searchedCount, 10000);
    }
    assert.deepStrictEqual(regex.files[0].blocks[0].lines[0].ranges, [[0, 20]]);
  });

  test('a file name search with a pattern that backtracks without end stops and reports it', async () => {
    const archives = createArchives({ 'a.big': [`${'a'.repeat(40)}b.txt`, 'c.txt'] });
    const { files, summary } = await searchNames(archives, '(a+)+$', '', '', true);

    assert.deepStrictEqual(files, []);
    assert.ok(summary.isPatternSlow);
    assert.ok(summary.slowCount > 0);
  });

  test('the page folds files to include, files to exclude and context lines under a toggle', () => {
    const { renderSearchPage } = requireWithVscode(
      { Uri: { joinPath: () => ({ toString: () => 'archiveSearch.js' }) } },
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      () => require('../../features/archiveSearch/renderSearchPage') as typeof import('../../features/archiveSearch/renderSearchPage'),
    );
    const html = renderSearchPage(
      { cspSource: 'vscode-resource:', asWebviewUri: (uri: unknown) => uri } as never,
      {} as never,
    );
    const start = html.indexOf('<div id="details" hidden>');
    const details = html.slice(start, html.indexOf('<div id="status"'));
    const beforeDetails = html.slice(0, start);

    assert.ok(start > 0, 'the details are not folded at first');

    for (const id of ['include', 'exclude', 'context']) {
      assert.ok(details.includes(`id="${id}"`), `${id} is not folded`);
    }
    for (const id of ['query', 'modeNames', 'case', 'word', 'regex', 'cancel']) {
      assert.ok(beforeDetails.includes(`id="${id}"`), `${id} must stay in view`);
    }
    assert.match(html, /id="detailsToggle"[^>]*aria-controls="details"/);
  });

  test('the search details stay as they were left, and start folded', () => {
    assert.strictEqual(readSearchState(undefined).isDetailsOpen, false);
    assert.deepStrictEqual(readSearchState(undefined), DEFAULT_SEARCH_STATE);
    assert.strictEqual(readSearchState({ ...DEFAULT_SEARCH_STATE, isDetailsOpen: true }).isDetailsOpen, true);
    assert.strictEqual(
      readSearchState({ ...DEFAULT_SEARCH_STATE, include: '*.ini', isDetailsOpen: false }).isDetailsOpen,
      false,
    );
  });

  test('a state saved before the details folded opens them only where it holds a filter', () => {
    const old = { text: 'Gandalf', include: '', exclude: 'data/lang/**', contextLines: '3', caseSensitive: true, wholeWord: false, regex: false };

    assert.deepStrictEqual(readSearchState(old), {
      ...old,
      target: 'text',
      isDetailsOpen: true,
    });
    assert.strictEqual(readSearchState({ ...old, exclude: '' }).isDetailsOpen, false);
    assert.deepStrictEqual(readSearchState({ text: 3, target: 'other' }), DEFAULT_SEARCH_STATE);
  });
});
