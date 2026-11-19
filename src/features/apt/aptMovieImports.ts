import type * as vscode from 'vscode';
import type {
  PageMovie,
  TexturePixels,
  ToPage,
} from '../../webview/apt/protocol';
import { collectTextKeys, resolveAptText } from '../../formats/apt/aptText';
import type { GameLanguage } from '../../services/ini/gameLanguage';
import type { SageIniDocuments } from '../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import type { AptDocument, BuiltMovie } from './aptDocument';
import type { AptLibrary, MovieLocation } from './aptLibrary';
import { toMovieKey } from './aptLibrary';
import { describeError } from '../../core/errors';
import { readEngineAnswers } from './aptEngineAnswers';

export interface AptGameServices {
  gameLanguage: GameLanguage;
  index: SageIniIndex;
  documents: SageIniDocuments;
  state: vscode.Memento;
}

type MovieMessage = Extract<ToPage, { kind: 'movie' }>;
type MovieLoadedMessage = Extract<ToPage, { kind: 'movieLoaded' }>;

interface ImportWalk {
  movies: Map<string, PageMovie>;
  library: Record<string, PageMovie>;
  textures: Record<string, TexturePixels>;
  unresolved: string[];
  origins: Record<string, string>;
  sentTextures: Set<string>;
  sentMovies: Map<string, string>;
  status?: (text: string) => void;
}

interface FetchedMovie {
  location: MovieLocation;
  stamp: string;
  page: PageMovie;
  textures: Record<string, TexturePixels>;
}

export interface MovieProgress {
  status(text: string): void;
  early(message: MovieMessage): Promise<void>;
}

const MAX_IMPORT_DEPTH = 8;
const MAX_IMPORTED_MOVIES = 64;

export interface AptMovieImportsHost {
  library: AptLibrary;
  game: AptGameServices;
  findDocument(key: string): AptDocument | undefined;
  load(uri: vscode.Uri): Promise<AptDocument>;
}

export interface AptMovieImports {
  buildMovieMessage(
    document: AptDocument,
    sentTextures: Set<string>,
    sentMovies: Map<string, string>,
    progress?: MovieProgress,
  ): Promise<MovieMessage>;
  buildLoadedMovieMessage(
    name: string,
    sentTextures: Set<string>,
    sentMovies: Map<string, string>,
  ): Promise<MovieLoadedMessage>;
  forget(): void;
}

export const createAptMovieImports = ({
  library,
  game,
  findDocument,
  load,
}: AptMovieImportsHost): AptMovieImports => {
  const loaded = new Map<string, Promise<AptDocument | undefined>>();

  const built = new Map<string, { stamp: string; movie: Promise<BuiltMovie> }>();

  let generation = 0;

  const getImportedMovie = (
    location: MovieLocation,
  ): Promise<AptDocument | undefined> => {
    const key = location.uri.toString();
    const open = findDocument(key);

    if (open) {
      return Promise.resolve(open);
    }

    let movie = loaded.get(key);

    if (!movie) {
      movie = load(location.uri).catch(() => undefined);
      loaded.set(key, movie);
    }
    return movie;
  };

  const createWalk = (
    sentTextures: Set<string>,
    sentMovies: Map<string, string>,
  ): ImportWalk => ({
    movies: new Map(),
    library: {},
    textures: {},
    unresolved: [],
    origins: {},
    sentTextures,
    sentMovies,
  });

  const takeUnsentTextures = (
    walk: ImportWalk,
    all: Record<string, TexturePixels>,
  ): void => {
    for (const [key, texture] of Object.entries(all)) {
      if (!walk.sentTextures.has(key)) {
        walk.textures[key] = texture;
        walk.sentTextures.add(key);
      }
    }
  };

  const buildImported = async (
    location: MovieLocation,
    source: AptDocument,
  ): Promise<FetchedMovie> => {
    const stamp = `${location.uri.toString()}#${source.version}#${generation}`;
    let entry = built.get(location.uri.toString());

    if (entry?.stamp !== stamp) {
      entry = { stamp, movie: source.build() };
      built.set(location.uri.toString(), entry);
    }

    const { movie, textures } = await entry.movie;

    return {
      location,
      stamp,
      page: { ...movie, origin: location.origin },
      textures,
    };
  };

  const readImported = async (
    name: string,
  ): Promise<FetchedMovie | undefined> => {
    const location = await library.locate(name);
    const source = location && (await getImportedMovie(location));

    return location && source ? buildImported(location, source) : undefined;
  };

  const takeMovie = (
    walk: ImportWalk,
    key: string,
    { location, stamp, page, textures }: FetchedMovie,
  ): PageMovie => {
    walk.movies.set(key, page);
    walk.origins[key] = location.origin;
    takeUnsentTextures(walk, textures);
    if (walk.sentMovies.get(key) !== stamp) {
      walk.library[key] = page;
      walk.sentMovies.set(key, stamp);
    }
    return page;
  };

  const followImports = async (
    walk: ImportWalk,
    queue: { movie: PageMovie; depth: number }[],
  ): Promise<number> => {
    let attempted = 0;

    while (queue.length) {
      const level = queue.splice(0);
      const wanted = new Map<string, string>();

      for (const { movie, depth } of level) {
        for (const entry of depth < MAX_IMPORT_DEPTH ? movie.imports : []) {
          const key = toMovieKey(entry.movie);

          if (!walk.movies.has(key) && !wanted.has(key)) {
            wanted.set(key, entry.movie);
          }
        }
      }

      const room = Math.max(0, MAX_IMPORTED_MOVIES + 1 - walk.movies.size);
      const reads = [...wanted].slice(0, room);

      if (reads.length) {
        walk.status?.(
          `Reading imported movies: ${reads
            .slice(0, 4)
            .map(([key]) => key)
            .join(', ')}${reads.length > 4 ? ` and ${reads.length - 4} more` : ''}…`,
        );
      }

      const fetched = new Map(
        await Promise.all(
          reads.map(
            async ([key, name]) => [key, await readImported(name)] as const,
          ),
        ),
      );

      for (const { movie, depth } of level) {
        for (const entry of movie.imports) {
          const key = toMovieKey(entry.movie);
          const read = fetched.get(key);

          attempted++;

          if (read && !walk.movies.has(key)) {
            queue.push({ movie: takeMovie(walk, key, read), depth: depth + 1 });
          }

          const target = walk.movies.get(key);

          if (
            !target?.exports.some(
              (each) => each.name.toLowerCase() === entry.name.toLowerCase(),
            )
          ) {
            walk.unresolved.push(`${entry.movie}:${entry.name}`);
          }
        }
      }
    }
    return attempted;
  };

  const resolveTexts = async (
    movies: readonly PageMovie[],
  ): Promise<Record<string, string> | undefined> => {
    await game.gameLanguage.ensure();

    if (!game.index.stringCount) {
      return undefined;
    }

    const keys = collectTextKeys(
      movies.flatMap((movie) => [
        ...(movie.consts ?? []),
        ...movie.characters.flatMap((character) =>
          character.type === 'editText' ? [character.text] : [],
        ),
      ]),
    );

    return Object.fromEntries(
      keys.map((key) => [
        key.toLowerCase(),
        resolveAptText(key, (label) => game.index.findString(label)?.text),
      ]),
    );
  };

  const loadedMovie = async (
    name: string,
    sentTextures: Set<string>,
    sentMovies: Map<string, string>,
  ): Promise<MovieLoadedMessage> => {
    const key = toMovieKey(name);
    const failed = (error: string) =>
      ({ kind: 'movieLoaded', name: key, error }) as const;

    try {
      const location = await library.locate(key);

      if (!location) {
        return failed(`no install holds ${key}.apt`);
      }

      const source = await getImportedMovie(location);

      if (!source) {
        return failed(`${key}.apt at ${location.origin} does not read`);
      }

      const walk = createWalk(sentTextures, sentMovies);
      const movie = takeMovie(
        walk,
        key,
        await buildImported(location, source),
      );

      walk.library[key] = movie;
      await followImports(walk, [{ movie, depth: 0 }]);
      return {
        kind: 'movieLoaded',
        name: key,
        library: walk.library,
        textures: walk.textures,
        unresolved: walk.unresolved,
        origins: walk.origins,
        texts: await resolveTexts([...walk.movies.values()]),
      };
    } catch (error) {
      return failed(describeError(error));
    }
  };

  const movieMessage = async (
    document: AptDocument,
    sentTextures: Set<string>,
    sentMovies: Map<string, string>,
    progress?: MovieProgress,
  ): Promise<MovieMessage> => {
    progress?.status(`Reading ${document.name}…`);

    const root = await document.build();
    const walk = createWalk(sentTextures, sentMovies);
    const answers = readEngineAnswers(game.state)[toMovieKey(document.name)];
    let early: Promise<void> | undefined;

    walk.status = progress?.status;
    walk.movies.set(toMovieKey(document.name), root.movie);
    takeUnsentTextures(walk, root.textures);

    if (progress && root.movie.imports.length) {
      early = progress.early({
        kind: 'movie',
        summary: root.summary,
        movie: root.movie,
        textures: walk.textures,
        library: {},
        unresolved: [],
        origins: {},
        texts: await resolveTexts([root.movie]),
        answers,
      });
      early.catch(() => undefined);
      walk.textures = {};
    }

    const attempted = await followImports(walk, [{ movie: root.movie, depth: 0 }]);

    await early;
    const { movies, library: sent, textures, unresolved, origins } = walk;

    const imports = attempted
      ? `imports ${attempted - unresolved.length} of ${attempted} resolved across ${movies.size - 1} movies` +
        (unresolved.length
          ? ` (unresolved: ${unresolved.slice(0, 6).join(', ')}${unresolved.length > 6 ? '…' : ''})`
          : '')
      : '';

    return {
      kind: 'movie',
      summary: [root.summary, imports].filter(Boolean).join(' · '),
      movie: root.movie,
      textures,
      library: sent,
      unresolved,
      origins,
      texts: await resolveTexts([...movies.values()]),
      answers,
    };
  };

  return {
    buildMovieMessage: movieMessage,
    buildLoadedMovieMessage: loadedMovie,
    forget() {
      loaded.clear();
      built.clear();
      generation++;
    },
  };
};
