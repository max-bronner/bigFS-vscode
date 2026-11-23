import * as assert from 'assert';
import type { Uri } from 'vscode';
import type { PageMovie, TexturePixels } from '../../webview/apt/protocol';
import type { AptDocument, BuiltMovie } from '../../features/apt/aptDocument';
import type { AptLibrary, MovieLocation } from '../../features/apt/aptLibrary';
import type {
  AptGameServices,
  MovieProgress,
} from '../../features/apt/aptMovieImports';
import { requireWithVscode } from './requireWithVscode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const imports = requireWithVscode({ FileType: { File: 1, Directory: 2 }, EventEmitter: class {} }, () => require('../../features/apt/aptMovieImports') as typeof import('../../features/apt/aptMovieImports'));

const pixels = (): TexturePixels => ({
  width: 1,
  height: 1,
  pixels: new Uint8Array(4),
});

const built = (
  name: string,
  importing: string[],
  exports: string[] = ['Thing'],
): BuiltMovie => ({
  summary: name,
  movie: {
    name,
    imports: importing.map((movie) => ({ movie, name: 'Thing' })),
    exports: exports.map((each) => ({ name: each, id: 1 })),
    characters: [],
    consts: [],
  } as unknown as PageMovie,
  textures: { [`${name.toLowerCase()}/tex`]: pixels() },
});

const documentOf = (movie: BuiltMovie): AptDocument =>
  ({
    name: movie.movie.name,
    version: 0,
    uri: { toString: () => `apt:/${movie.movie.name}` },
    build: async () => movie,
  }) as unknown as AptDocument;

interface Fixture {
  create: ReturnType<typeof imports.createAptMovieImports>;
  concurrent: () => number;
}

const fixture = (
  movies: BuiltMovie[],
  delay = 5,
  index: object = { stringCount: 0, whenReady: async () => undefined },
): Fixture => {
  const documents = new Map(
    movies.map((movie) => [movie.movie.name.toLowerCase(), documentOf(movie)]),
  );
  let active = 0;
  let most = 0;
  const library = {
    async locate(name: string): Promise<MovieLocation | undefined> {
      const key = name.toLowerCase().replace(/\.apt$/, '');

      active++;
      most = Math.max(most, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active--;
      return documents.has(key)
        ? ({ uri: { toString: () => `apt:/${key}` } as Uri, origin: 'test.big' })
        : undefined;
    },
  } as unknown as AptLibrary;
  const game = {
    gameLanguage: { ensure: async () => undefined },
    index,
    state: { get: (_key: string, fallback: unknown) => fallback },
  } as unknown as AptGameServices;

  return {
    create: imports.createAptMovieImports({
      library,
      game,
      findDocument: () => undefined,
      load: async (uri) =>
        documents.get(uri.toString().replace('apt:/', ''))!,
    }),
    concurrent: () => most,
  };
};

suite('APT movie imports', () => {
  const root = built('Root', ['LibA', 'LibB', 'Missing']);
  const libA = built('LibA', ['LibC']);
  const libB = built('LibB', []);
  const libC = built('LibC', []);

  test('the movies one level of imports names are read together', async () => {
    const { create, concurrent } = fixture([root, libA, libB, libC]);
    const message = await create.buildMovieMessage(
      documentOf(root),
      new Set(),
      new Map(),
    );

    assert.ok(concurrent() >= 3, `read ${concurrent()} at a time`);
    assert.deepStrictEqual(Object.keys(message.library).sort(), [
      'liba',
      'libb',
      'libc',
    ]);
    assert.deepStrictEqual(message.unresolved, ['Missing:Thing']);
    assert.strictEqual(message.origins.libc, 'test.big');
  });

  test('imports the movies do not export are reported in order', async () => {
    const partial = built('Root', ['LibA', 'LibB']);
    const { create } = fixture([
      partial,
      built('LibA', [], ['Other']),
      built('LibB', []),
    ]);
    const message = await create.buildMovieMessage(
      documentOf(partial),
      new Set(),
      new Map(),
    );

    assert.deepStrictEqual(message.unresolved, ['LibA:Thing']);
  });

  test('the movie is handed over alone before its imports, and not sent twice', async () => {
    const { create } = fixture([root, libA, libB, libC]);
    const order: string[] = [];
    const earlyMessages: Parameters<MovieProgress['early']>[0][] = [];
    const progress: MovieProgress = {
      status: (text) => order.push(`status ${text.slice(0, 7)}`),
      early: async (message) => {
        earlyMessages.push(message);
        order.push('early');
      },
    };
    const message = await create.buildMovieMessage(
      documentOf(root),
      new Set(),
      new Map(),
      progress,
    );

    assert.strictEqual(earlyMessages.length, 1);
    assert.deepStrictEqual(earlyMessages[0].library, {});
    assert.deepStrictEqual(Object.keys(earlyMessages[0].textures), [
      'root/tex',
    ]);
    assert.ok(!('root/tex' in message.textures));
    assert.deepStrictEqual(Object.keys(message.textures).sort(), [
      'liba/tex',
      'libb/tex',
      'libc/tex',
    ]);
    assert.deepStrictEqual(order.slice(0, 2), ['status Reading', 'early']);
  });

  test('a movie with no imports is not handed over twice', async () => {
    const alone = built('Alone', []);
    const { create } = fixture([alone]);
    let early = 0;
    const message = await create.buildMovieMessage(
      documentOf(alone),
      new Set(),
      new Map(),
      { status: () => undefined, early: async () => void early++ },
    );

    assert.strictEqual(early, 0);
    assert.deepStrictEqual(Object.keys(message.textures), ['alone/tex']);
  });

  test('$KEY text is read once the string tables are, from fields, pools and pushes', async () => {
    let isReady = false;
    const table: Record<string, string> = {
      'apt:soloplay': 'SOLO PLAY',
      'apt:title': 'TITLE',
      'apt:pushed': 'PUSHED',
      'apt:inner': 'INNER',
    };
    const index = {
      whenReady: async () => {
        isReady = true;
      },
      get stringCount() {
        return isReady ? Object.keys(table).length : 0;
      },
      findString: (label: string) => {
        const text = isReady ? table[label.toLowerCase()] : undefined;

        return text === undefined ? undefined : { text };
      },
    };
    const movie = built('Texts', []);

    movie.movie.consts = ['$Title'];
    movie.movie.characters = [
      { type: 'editText', text: '$SoloPlay&dropShadow' },
    ] as unknown as typeof movie.movie.characters;
    movie.movie.code = {
      8: [
        { offset: 8, opcode: 0xa1, name: 'EA_PushString', operand: '$Pushed' },
        {
          offset: 10,
          opcode: 0x9b,
          name: 'DefineFunction',
          operand: {
            name: 'f',
            params: [],
            flags: 0,
            isVersion2: false,
            body: [{ offset: 20, opcode: 0xa1, name: 'EA_PushString', operand: '$Inner' }],
          },
        },
      ],
    };

    const { create } = fixture([movie], 5, index);
    const message = await create.buildMovieMessage(documentOf(movie), new Set(), new Map());

    assert.deepStrictEqual(message.texts, {
      $title: 'TITLE',
      $soloplay: 'SOLO PLAY',
      $pushed: 'PUSHED',
      $inner: 'INNER',
    });
  });
});
