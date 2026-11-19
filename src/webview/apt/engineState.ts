import type { PlaySoundRequest } from '../../core/soundClip';
import { Engine } from './avm/engine';
import { pageSoundPlayer } from '../shared/pageSoundPlayer';
import { getVsCodeApi } from '../shared/vscodeApi';
import type { EngineValues, FromPage, PageMovie } from './protocol';

const vscode = getVsCodeApi<FromPage>();

export const postSoundRequest = (request: PlaySoundRequest): void =>
  vscode.postMessage(request);

const listeners = { change: () => {}, log: (_line: string) => {} };

export const engine = new Engine(
  () => listeners.change(),
  (line) => listeners.log(line),
  (event) => pageSoundPlayer.request(event, postSoundRequest),
);

export const onEngineChange = (change: () => void): void => {
  listeners.change = change;
};

export const onEngineLog = (log: (line: string) => void): void => {
  listeners.log = log;
};

let current = '';
let kept: EngineValues | undefined;

export const watchMovie = (movie: PageMovie): void => {
  if (movie.name !== current) {
    current = movie.name;
    engine.load(kept);
  }
  engine.reset(movie);
};

export const keepAnswers = (answers: EngineValues | undefined): void => {
  kept = answers;
};

export const saveAnswers = (): void => {
  kept = engine.save();
  vscode.postMessage({ kind: 'engineAnswers', values: kept });
};
