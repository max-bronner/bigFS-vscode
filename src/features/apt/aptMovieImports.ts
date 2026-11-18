import type * as vscode from 'vscode';
import type {
  PageMovie,
  TexturePixels,
  ToPage,
} from '../../webview/apt/protocol';
import { collectTextKeys, resolveAptText } from '../../formats/apt/aptText';
import type { GameLanguage } from '../../services/ini/gameLanguage';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import type { AptDocument, BuiltMovie } from './aptDocument';
import type { AptLibrary, MovieLocation } from './aptLibrary';
import { movieKey } from './aptLibrary';
import { describeError } from '../../core/errors';
import { readEngineAnswers } from './aptEngineAnswers';

export interface AptGameServices {
  gameLanguage: GameLanguage;
  index: SageIniIndex;
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
  movieMessage(
    document: AptDocument,
    sentTextures: Set<string>,
    sentMovies: Map<string, string>,
  ): Promise<MovieMessage>;
  loadedMovie(
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

  const importedMovie = (
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

  const newWalk = (
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

  const take = (
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

  const fetchMovie = async (
    walk: ImportWalk,
    key: string,
    location: MovieLocation,
    source: AptDocument,
  ): Promise<PageMovie> => {
    const stamp = `${location.uri.toString()}#${source.version}#${generation}`;
    let entry = built.get(location.uri.toString());

    if (entry?.stamp !== stamp) {
      entry = { stamp, movie: source.build() };
      built.set(location.uri.toString(), entry);
    }

    const { movie: target, textures: own } = await entry.movie;
    const page = { ...target, origin: location.origin };

    walk.movies.set(key, page);
    walk.origins[key] = location.origin;
    take(walk, own);
    if (walk.sentMovies.get(key) !== stamp) {
      walk.library[key] = page;
      walk.sentMovies.set(key, stamp);
    }
    return page;
  };

  const follow = async (
    walk: ImportWalk,
    queue: { movie: PageMovie; depth: number }[],
  ): Promise<number> => {
    let attempted = 0;

    while (queue.length) {
      const { movie, depth } = queue.shift()!;

      for (const entry of movie.imports) {
        const key = movieKey(entry.movie);

        attempted++;

        if (
          !walk.movies.has(key) &&
          depth < MAX_IMPORT_DEPTH &&
          walk.movies.size <= MAX_IMPORTED_MOVIES
        ) {
          const location = await library.locate(entry.movie);
          const source = location && (await importedMovie(location));

          if (location && source) {
            queue.push({
              movie: await fetchMovie(walk, key, location, source),
              depth: depth + 1,
            });
          }
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
    return attempted;
  };

  const textsOf = async (
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
    const key = movieKey(name);
    const failed = (error: string) =>
      ({ kind: 'movieLoaded', name: key, error }) as const;

    try {
      const location = await library.locate(key);

      if (!location) {
        return failed(`no install holds ${key}.apt`);
      }

      const source = await importedMovie(location);

      if (!source) {
        return failed(`${key}.apt at ${location.origin} does not read`);
      }

      const walk = newWalk(sentTextures, sentMovies);
      const movie = await fetchMovie(walk, key, location, source);

      walk.library[key] = movie;
      await follow(walk, [{ movie, depth: 0 }]);
      return {
        kind: 'movieLoaded',
        name: key,
        library: walk.library,
        textures: walk.textures,
        unresolved: walk.unresolved,
        origins: walk.origins,
        texts: await textsOf([...walk.movies.values()]),
      };
    } catch (error) {
      return failed(describeError(error));
    }
  };

  const movieMessage = async (
    document: AptDocument,
    sentTextures: Set<string>,
    sentMovies: Map<string, string>,
  ): Promise<MovieMessage> => {
    const root = await document.build();
    const walk = newWalk(sentTextures, sentMovies);

    walk.movies.set(movieKey(document.name), root.movie);
    take(walk, root.textures);

    const attempted = await follow(walk, [{ movie: root.movie, depth: 0 }]);
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
      texts: await textsOf([...movies.values()]),
      answers: readEngineAnswers(game.state)[movieKey(document.name)],
    };
  };

  return {
    movieMessage,
    loadedMovie,
    forget() {
      loaded.clear();
      built.clear();
      generation++;
    },
  };
};
