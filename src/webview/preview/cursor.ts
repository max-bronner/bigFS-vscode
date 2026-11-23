import {
  JIFFIES_PER_SECOND,
  jiffiesToMilliseconds,
} from '../../formats/cursor/jiffies';
import type { CursorFrame } from '../../formats/cursor/cursorFrame';
import { drawCursorFrame, pickCursorScale } from '../shared/drawCursorFrame';
import { element } from '../shared/element';
import type { CursorMessage } from './protocol';

export type SaveFrame = (index: number) => void;

const createSaveButton = (title: string, save: () => void) => {
  const button = element('button', 'Save as PNG');

  button.title = title;
  button.onclick = save;
  return button;
};

const describeFrame = ({ width, height, hotspotX, hotspotY }: CursorFrame) =>
  `${width} × ${height} · hotspot ${hotspotX}, ${hotspotY}`;

const createFrameCard = (frame: CursorFrame, caption: string, saveButton: HTMLButtonElement) => {
  const card = element('figure');
  const stage = element('div', undefined, 'stage checker');
  const canvas = element('canvas', undefined, 'pixelated');

  card.style.margin = '0';
  drawCursorFrame(canvas, frame, pickCursorScale(frame));
  stage.append(canvas);
  saveButton.style.marginTop = '4px';
  card.append(stage, element('figcaption', caption), saveButton);

  return card;
};

const createPlayer = (
  frames: CursorFrame[],
  steps: NonNullable<CursorMessage['steps']>,
  saveFrame: SaveFrame,
) => {
  const canvas = element('canvas', undefined, 'pixelated');
  const stage = element('div', undefined, 'stage checker');
  const bar = element('div', undefined, 'controls');
  const play = element('button');
  const slider = element('input');
  const label = element('span', undefined, 'status');
  const scale = pickCursorScale(frames[0], 192);
  let step = 0;
  let timer: number | undefined;

  slider.type = 'range';
  slider.min = '0';
  slider.max = String(steps.length - 1);
  stage.append(canvas);
  bar.append(
    play,
    slider,
    label,
    createSaveButton('Save the frame shown as PNG', () => saveFrame(steps[step].frame)),
  );

  const show = (index: number) => {
    step = index;

    const { frame, jiffies } = steps[step];

    drawCursorFrame(canvas, frames[frame], scale);
    slider.value = String(step);
    label.textContent = `step ${step + 1} / ${steps.length} · frame ${frame + 1} · ${jiffiesToMilliseconds(jiffies)} ms`;
  };
  const stop = () => {
    window.clearTimeout(timer);
    timer = undefined;
    play.textContent = 'Play';
  };
  const schedule = () => {
    timer = window.setTimeout(
      () => {
        show((step + 1) % steps.length);
        schedule();
      },
      Math.max(1, jiffiesToMilliseconds(steps[step].jiffies)),
    );
  };
  const start = () => {
    play.textContent = 'Pause';
    schedule();
  };

  play.onclick = () => (timer === undefined ? start() : stop());
  slider.oninput = () => {
    stop();
    show(Number(slider.value));
  };
  show(0);
  start();

  return [bar, stage];
};

export const showCursor = (
  main: HTMLElement,
  { frames, steps }: CursorMessage,
  saveFrame: SaveFrame,
) => {
  const list = element('div');
  const loopJiffies = steps?.reduce((sum, step) => sum + step.jiffies, 0) ?? 0;
  const facts = element(
    'p',
    steps
      ? `${frames.length} frames · ${steps.length} steps · ${(loopJiffies / JIFFIES_PER_SECOND).toFixed(2)} s a loop · ${frames[0].width} × ${frames[0].height}`
      : frames.length > 1
        ? `${frames.length} images`
        : '',
  );

  list.style.cssText =
    'display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px';
  list.append(
    ...frames.map((frame, index) =>
      createFrameCard(
        frame,
        steps
          ? `frame ${index + 1} · hotspot ${frame.hotspotX}, ${frame.hotspotY}`
          : describeFrame(frame),
        createSaveButton(
          frames.length > 1 ? `Save frame ${index + 1} as PNG` : 'Save this image as PNG',
          () => saveFrame(index),
        ),
      ),
    ),
  );
  main.replaceChildren(
    ...(steps ? createPlayer(frames, steps, saveFrame) : []),
    facts,
    list,
  );
};
