import { element } from '../shared/element';

export const createSideRow = (
  name: string,
  detail: string | undefined,
  onPick: () => void,
): HTMLButtonElement => {
  const row = element('button', undefined, 'side-row');

  row.append(element('span', name));
  if (detail) {
    row.append(element('span', detail, 'where'));
  }
  row.setAttribute('aria-pressed', 'false');
  row.onclick = onPick;
  return row;
};
