import { getMovieName } from './avm/movieLoad';
import type { Vm } from './avm/vm';
import { describeInstance } from './describeInstance';
import type { Instance } from './instance';
import type { PageMovie } from './protocol';
import type { ScriptQueue } from './scriptQueue';
import { getFrames } from './timeline';

const LEVEL_DEPTH = 1_000_000;

export interface MovieLoadHost {
  queue: ScriptQueue;
  getVm(): Vm | undefined;
  getRoot(): Instance;
  log(line: string): void;
  fetchMovie(name: string, done: (movie: PageMovie | string) => void): void;
  createEmpty(parent: Instance, name: string, depth: number): Instance;
  remove(clip: Instance): void;
  retire(instance: Instance): void;
  queueInitActions(movie: PageMovie, on?: Instance): void;
  enter(timeline: Instance, frame: number): void;
  scheduleClip(clip: Instance): void;
  drainScripts(): void;
}

export const createMovieLoader = (host: MovieLoadHost) => {
  const findLevelClip = (level: number) =>
    [...host.getRoot().children.values()].find(
      (child) => child.name?.toLowerCase() === `_level${level}`,
    );

  const mount = (into: Instance | number, movie: PageMovie) => {
    const rootId = movie.characters.findIndex(
      (character) => character?.type === 'movie',
    );
    const clip =
      typeof into === 'number'
        ? (findLevelClip(into) ??
          host.createEmpty(host.getRoot(), `_level${into}`, LEVEL_DEPTH + into))
        : into;

    if (rootId < 0 || clip.removed) {
      host.log(
        `loadMovie: ${movie.name} ${rootId < 0 ? 'has no root timeline' : 'was unloaded before it arrived'}`,
      );
      return;
    }
    clip.children.forEach(host.retire);
    clip.children = new Map();
    clip.hits = [];
    clip.movie = movie;
    clip.id = rootId;
    clip.character = movie.characters[rootId];
    clip.missing = undefined;
    clip.frames = getFrames(movie, clip.character);
    clip.frame = 0;
    clip.playing = true;
    clip.visible = true;
    host.scheduleClip(clip);

    const vm = host.getVm();

    vm?.initialised.forEach((key) => {
      if (key.startsWith(`${movie.name}#`)) {
        vm.initialised.delete(key);
      }
    });
    host.queueInitActions(movie, clip);
    host.enter(clip, 0);
    host.log(`loadMovie: ${movie.name} is in ${describeInstance(clip)}`);
    host.drainScripts();
  };

  const unload = (into: Instance | number) => {
    const clip = typeof into === 'number' ? findLevelClip(into) : into;

    if (!clip || clip.removed) {
      return;
    }
    if (typeof into === 'number') {
      host.remove(clip);
      return;
    }
    clip.children.forEach(host.retire);
    clip.children = new Map();
    clip.frames = [];
    clip.frame = 0;
    clip.playing = false;
  };

  return (into: Instance | number, url: string | undefined): void => {
    const log = (line: string) => host.log(`loadMovie: ${line}`);

    if (typeof into !== 'number' && !into.parent) {
      log('the movie shown cannot be replaced or emptied');
      return;
    }
    if (url === undefined) {
      host.queue.add(() => unload(into));
      host.drainScripts();
      return;
    }

    const name = getMovieName(url);

    if (!name) {
      log(`${JSON.stringify(url)} names no movie`);
      return;
    }
    if (into === 0) {
      log(`${name} cannot replace _level0, the movie shown`);
      return;
    }
    host.fetchMovie(name, (found) => {
      if (typeof found === 'string') {
        log(`${name} not loaded: ${found}`);
        return;
      }
      host.queue.add(() => mount(into, found));
      host.drainScripts();
    });
  };
};
