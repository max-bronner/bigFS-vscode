import { element } from './element';

export interface DisclosureRow {
  root: HTMLElement;
  members: HTMLElement;
  box: HTMLInputElement;
}

export interface DisclosureRowOptions {
  text: readonly (string | Node)[];
  name: string;
  isOpen: boolean;
  key?: string;
  onToggleOpen(isOpen: boolean): void;
  onSwitch(on: boolean): void;
}

export interface GroupCheckState {
  checked: boolean;
  indeterminate: boolean;
}

export const getGroupCheckState = (on: number, count: number): GroupCheckState => ({
  checked: on > 0,
  indeterminate: on > 0 && on < count,
});

const SVG = 'http://www.w3.org/2000/svg';

let listCount = 0;

const createChevron = () => {
  const svg = document.createElementNS(SVG, 'svg');
  const path = document.createElementNS(SVG, 'path');

  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', 'M6 3.5 10.5 8 6 12.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.3');
  svg.append(path);
  return svg;
};

export const createDisclosureRow = ({
  text,
  name,
  isOpen,
  key,
  onToggleOpen,
  onSwitch,
}: DisclosureRowOptions): DisclosureRow => {
  const root = element('div', undefined, 'disclosure');
  const row = element('div', undefined, 'disclosure-row');
  const arrow = element('button', undefined, 'disclosure-arrow');
  const label = element('label', undefined, 'disclosure-label');
  const box = element('input');
  const words = element('span', undefined, 'disclosure-text');
  const members = element('div', undefined, 'disclosure-members');

  let isOpenNow = isOpen;

  const setOpen = (open: boolean) => {
    isOpenNow = open;
    arrow.setAttribute('aria-expanded', String(open));
    arrow.title = open ? 'Close' : 'Open';
    members.hidden = !open;
  };
  const toggle = (open: boolean) => {
    if (open !== isOpenNow) {
      setOpen(open);
      onToggleOpen(open);
    }
  };

  members.id = `disclosure-${++listCount}`;
  arrow.type = 'button';
  arrow.setAttribute('aria-controls', members.id);
  arrow.setAttribute('aria-label', name);
  arrow.append(createChevron());
  arrow.onclick = () => toggle(!isOpenNow);
  arrow.onkeydown = (event) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      toggle(event.key === 'ArrowRight');
    }
    if ([' ', 'Enter', 'ArrowRight', 'ArrowLeft'].includes(event.key)) {
      event.stopPropagation();
    }
  };
  box.type = 'checkbox';
  box.onchange = () => onSwitch(box.checked);
  if (key !== undefined) {
    box.dataset.key = key;
    arrow.dataset.key = `${key}#open`;
  }
  words.append(...text);
  label.append(box, words);
  row.append(arrow, label);
  root.append(row, members);
  setOpen(isOpen);
  return { root, members, box };
};
