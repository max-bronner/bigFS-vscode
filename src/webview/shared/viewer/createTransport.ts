import { element } from '../element';
import { advancePlayhead } from './advancePlayhead';

const STEP_SECONDS = 1 / 30;
const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4];

export interface TransportHooks {
  getLength(): number;
  isBusy(): boolean;
  canPlay(): boolean;
  describeTime(time: number): { text: string; title: string };
  onAdvance(time: number): void;
  onSeek(time: number): void;
  onRestart(): void;
}

export interface Transport {
  buttons: HTMLElement[];
  timeline: HTMLElement[];
  getTime(): number;
  getMaterialSeconds(): number;
  isPlaying(): boolean;
  setPlaying(playing: boolean): void;
  playUnlessPaused(): void;
  togglePlaying(): void;
  advance(seconds: number): void;
  step(): void;
  restart(): void;
  refresh(): void;
}

const createButton = (text: string, title: string) => {
  const button = element('button', text);

  button.title = title;
  button.setAttribute('aria-label', title);
  return button;
};

export const createTransport = (hooks: TransportHooks): Transport => {
  const play = createButton('❚❚', 'Pause (Space)');
  const stop = createButton('■', 'Stop: back to the start, paused');
  const restartButton = createButton('↺', 'Restart (R)');
  const stepButton = createButton('⇥', 'Step one frame (.)');
  const loop = createButton('⟳', 'Loop: start over at the end');
  const slider = element('input');
  const time = element('span', '', 'viewer-time');
  const speedSelect = element('select');
  const clock = { time: 0, materialSeconds: 0, playing: true, speed: 1, loops: true };
  let isPausedByHand = false;

  play.id = 'viewerPlay';
  loop.id = 'viewerLoop';
  loop.setAttribute('aria-pressed', 'true');
  slider.type = 'range';
  slider.min = '0';
  slider.step = 'any';
  slider.title = 'Time';
  speedSelect.title = 'Playback speed';
  speedSelect.append(...SPEEDS.map((speed) => new Option(`${speed}×`, String(speed))));
  speedSelect.value = '1';

  const isPlaying = () => clock.playing && hooks.canPlay();

  const refresh = () => {
    const length = hooks.getLength();
    const canPlay = hooks.canPlay();
    const playing = isPlaying();
    const label = playing ? 'Pause (Space)' : 'Play (Space)';
    const described = hooks.describeTime(clock.time);

    play.textContent = playing ? '❚❚' : '▶';
    play.title = label;
    play.setAttribute('aria-label', label);
    for (const each of [play, stop, restartButton, stepButton, loop, speedSelect]) {
      each.hidden = !canPlay;
    }
    slider.hidden = time.hidden = !canPlay && !length;
    slider.disabled = !length;
    slider.max = String(Math.max(length, clock.time));
    slider.value = String(clock.time);
    if (time.textContent !== described.text) {
      time.textContent = described.text;
    }
    time.title = described.title;
  };

  const setPlaying = (playing: boolean) => {
    clock.playing = playing;
    isPausedByHand = !playing;
    refresh();
  };

  const playUnlessPaused = () => {
    if (!isPausedByHand) {
      setPlaying(true);
    }
  };

  const restart = () => {
    clock.time = 0;
    hooks.onRestart();
    refresh();
  };

  const togglePlaying = () => {
    const length = hooks.getLength();

    if (!clock.playing && length && clock.time >= length && !hooks.isBusy()) {
      restart();
    }
    setPlaying(!clock.playing);
  };

  const advance = (seconds: number) => {
    const elapsed = seconds * clock.speed;
    const move = advancePlayhead(
      clock.time,
      elapsed,
      hooks.getLength(),
      hooks.isBusy(),
      clock.loops,
    );

    clock.materialSeconds += elapsed;
    clock.time = move.time;
    if (move.hasWrapped) {
      hooks.onRestart();
    } else {
      hooks.onAdvance(clock.time);
    }
    if (move.hasEnded) {
      clock.playing = false;
    }
    refresh();
  };

  play.onclick = togglePlaying;
  stop.onclick = () => {
    clock.playing = false;
    isPausedByHand = true;
    restart();
  };
  restartButton.onclick = restart;
  stepButton.onclick = () => {
    clock.playing = false;
    isPausedByHand = true;
    clock.time += STEP_SECONDS;
    clock.materialSeconds += STEP_SECONDS;
    hooks.onAdvance(clock.time);
    refresh();
  };
  loop.onclick = () => {
    clock.loops = !clock.loops;
    loop.setAttribute('aria-pressed', String(clock.loops));
  };
  speedSelect.onchange = () => {
    clock.speed = Number(speedSelect.value);
  };
  slider.oninput = () => {
    const at = Number(slider.value);

    clock.playing = false;
    isPausedByHand = true;
    clock.materialSeconds += at - clock.time;
    clock.time = at;
    hooks.onSeek(at);
    refresh();
  };

  return {
    buttons: [play, stop, restartButton, stepButton, loop],
    timeline: [slider, time, speedSelect],
    getTime: () => clock.time,
    getMaterialSeconds: () => clock.materialSeconds,
    isPlaying,
    setPlaying,
    playUnlessPaused,
    togglePlaying,
    advance,
    step: () => {
      if (hooks.canPlay()) {
        stepButton.click();
      }
    },
    restart,
    refresh,
  };
};
