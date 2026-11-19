import type { Character } from '../../formats/apt/aptMovie';
import type { PageMovie } from './protocol';
import { state } from './state';

const MAX_HOPS = 8;

export const toMovieKey = (name: string): string =>
  name.toLowerCase().replace(/\.apt$/, '');

export const findMovieNamed = (name: string): PageMovie | undefined => {
  const key = toMovieKey(name);

  return state.movie && toMovieKey(state.movie.name) === key
    ? state.movie
    : state.library.get(key);
};

export interface Resolved {
  movie: PageMovie;
  id: number;
  character: Character;
}

export const resolve = (movie: PageMovie, id: number): Resolved | undefined => {
  let current: Resolved | undefined = movie.characters[id] && {
    movie,
    id,
    character: movie.characters[id],
  };

  for (let hop = 0; current?.character.type === 'placeholder'; hop++) {
    const from: PageMovie = current.movie;
    const slot: number = current.id;
    const entry = from.imports.find((each) => each.character === slot);
    const target = entry && findMovieNamed(entry.movie);
    const exported = target?.exports.find(
      (each) => each.name.toLowerCase() === entry!.name.toLowerCase(),
    );
    const character: Character | undefined =
      exported && target!.characters[exported.character];

    current =
      hop < MAX_HOPS && exported && character
        ? { movie: target!, id: exported.character, character }
        : undefined;
  }
  return current;
};
