import { createSoundButton } from '../shared/createSoundButton';
import { element } from '../shared/element';
import { pageSoundPlayer } from '../shared/pageSoundPlayer';
import { getVsCodeApi } from '../shared/vscodeApi';
import type { FromSoundPage, ToSoundPage } from './protocol';

const HISTORY = 12;

const vscode = getVsCodeApi<FromSoundPage>();
const status = document.getElementById('status')!;
const list = document.getElementById('history')!;
const start = document.getElementById('start') as HTMLButtonElement;
const history: string[] = [];

const post = (request: FromSoundPage) => vscode.postMessage(request);

const describeState = (): string => {
  const { phase, name, error } = pageSoundPlayer.state();

  switch (phase) {
    case 'loading':
      return `Loading ${name}`;
    case 'playing':
      return `Playing ${name}`;
    case 'blocked':
      return 'VS Code starts sound only after one click or key press here. Leave this panel open and the next ones play at once.';
    default:
      return error ?? (name ? `Stopped ${name}` : 'Nothing played yet');
  }
};

const showHistory = () =>
  list.replaceChildren(
    ...history.map((name) => {
      const item = element('li');

      item.append(createSoundButton(name, post), ` ${name}`);
      return item;
    }),
  );

const showStart = () => {
  const { phase, name } = pageSoundPlayer.state();

  start.hidden = phase !== 'blocked';
  if (!start.hidden) {
    start.textContent = `▶ Play ${name} (Enter)`;
    start.focus();
  }
};

start.onclick = (event) => {
  const { name } = pageSoundPlayer.state();

  if (name) {
    pageSoundPlayer.press(name, event, post);
  }
};
window.addEventListener('focus', showStart);

pageSoundPlayer.subscribe(() => {
  status.textContent = describeState();
  showStart();
});

window.addEventListener('message', ({ data }: MessageEvent<ToSoundPage>) => {
  if (data.kind !== 'sound') {
    return;
  }
  if (data.id === undefined) {
    data = { ...data, id: pageSoundPlayer.begin(data.name) };
    if (!history.includes(data.name)) {
      history.unshift(data.name);
      history.splice(HISTORY);
      showHistory();
    }
  }
  void pageSoundPlayer.receive(data);
});

status.textContent = describeState();
vscode.postMessage({ kind: 'ready' });
