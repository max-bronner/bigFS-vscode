import { element } from '../shared/element';

const MIN_WIDTH = 180;
const MAX_SHARE = 0.7;

export interface PanelSplitterEvents {
  onResize(width: number): void;
}

export const createPanelSplitter = (
  panel: HTMLElement,
  events: PanelSplitterEvents,
): ((width: number) => void) => {
  const bar = element('div', undefined, 'splitter');

  const setWidth = (width: number) => {
    const widest = Math.max(MIN_WIDTH, window.innerWidth * MAX_SHARE);

    panel.style.width = `${Math.min(Math.max(MIN_WIDTH, width), widest)}px`;
  };

  bar.title = 'Drag to resize the list of what uses this texture';
  bar.onpointerdown = (down) => {
    bar.setPointerCapture(down.pointerId);
    bar.onpointermove = (move) => {
      setWidth(panel.getBoundingClientRect().right - move.clientX);
    };
    bar.onpointerup = () => {
      bar.onpointermove = null;
      bar.onpointerup = null;
      events.onResize(panel.getBoundingClientRect().width);
    };
  };
  panel.before(bar);
  new MutationObserver(() => {
    bar.hidden = panel.hidden;
  }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  bar.hidden = panel.hidden;

  return setWidth;
};
