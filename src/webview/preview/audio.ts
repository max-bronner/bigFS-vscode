import { element } from '../shared/element';
import { getWavePeaks } from './getWavePeaks';
import { listFileUses } from './listFileUses';
import type { AudioMessage, FileUse } from './protocol';

const WAVE_HEIGHT = 64;

const addFact = (list: HTMLElement, term: string, value: string) => {
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');

  dt.textContent = term;
  dd.textContent = value;
  list.append(dt, dd);
};

const createWaveform = (
  audio: HTMLAudioElement,
  { wav, info }: AudioMessage,
): HTMLCanvasElement => {
  const canvas = element('canvas', undefined, 'wave');
  let peaks: { width: number; values: Float32Array } | undefined;

  canvas.title = 'Click to move the playhead; the sound plays only from its own play button';

  const draw = () => {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(WAVE_HEIGHT * ratio);
    const context = canvas.getContext('2d');

    if (!context || !width) {
      return;
    }
    if (peaks?.width !== width) {
      peaks = { width, values: getWavePeaks(wav, info.channels, width) };
    }
    canvas.width = width;
    canvas.height = height;

    const style = getComputedStyle(canvas);
    const accent = style.getPropertyValue('--vscode-focusBorder').trim() || '#0078d4';
    const played = info.durationSeconds
      ? Math.round((audio.currentTime / info.durationSeconds) * width)
      : 0;
    const middle = height / 2;
    const { values } = peaks;

    for (let x = 0; x < values.length / 2; x++) {
      const top = middle - values[x * 2 + 1] * middle;
      const bottom = middle - values[x * 2] * middle;

      context.fillStyle = x < played ? accent : style.color;
      context.globalAlpha = x < played ? 1 : 0.6;
      context.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
    context.globalAlpha = 1;
    context.fillStyle = accent;
    context.fillRect(Math.min(played, width - ratio), 0, ratio, height);
  };

  let frame = 0;
  const follow = () => {
    draw();
    frame = audio.paused ? 0 : requestAnimationFrame(follow);
  };

  canvas.onpointerdown = (event) => {
    const box = canvas.getBoundingClientRect();

    if (box.width && Number.isFinite(audio.duration)) {
      audio.currentTime = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * audio.duration;
    }
  };
  audio.addEventListener('play', () => {
    if (!frame) {
      follow();
    }
  });
  audio.addEventListener('timeupdate', () => {
    if (!frame) {
      draw();
    }
  });
  new ResizeObserver(draw).observe(canvas);
  return canvas;
};

export const showAudio = (
  main: HTMLElement,
  message: AudioMessage,
  reveal: (use: FileUse) => void,
): ((uses: readonly FileUse[]) => void) => {
  const { wav, info } = message;
  const list = document.createElement('dl');
  const audio = document.createElement('audio');
  const heading = element('h3', 'Used in');
  const usedIn = element('div', 'Looking for the INI lines that play this sound…', 'uses');

  addFact(list, 'Codec', info.format);
  addFact(list, 'Channels', String(info.channels));
  addFact(list, 'Sample rate', `${info.sampleRate} Hz`);
  addFact(list, 'Bits per sample', String(info.bitsPerSample));
  addFact(list, 'Duration', `${info.durationSeconds.toFixed(2)} s`);
  audio.controls = true;
  audio.src = URL.createObjectURL(
    new Blob([wav as BlobPart], { type: 'audio/wav' }),
  );

  const uses = element('section', undefined, 'sound-uses');

  uses.append(heading, usedIn);
  main.replaceChildren(uses, list, createWaveform(audio, message), audio);

  return (found) => {
    heading.textContent = found.length ? `Used in (${found.length})` : 'Used in';
    usedIn.replaceChildren(...listFileUses(found, reveal));
  };
};
