import { element } from '../shared/element';
import { $ } from './page';
import { revealFold } from './revealFold';

export interface LookChip {
  title: string;
  value: string;
  fold: HTMLDetailsElement;
}

export const showLookChips = (chips: readonly LookChip[]): void => {
  $('lookChips').replaceChildren(
    ...chips.map(({ title, value, fold }) => {
      const chip = element('button', `${title} `, 'look-chip');

      chip.append(element('b', value));
      chip.title = `${title}: ${value}. Opens where it is set.`;
      chip.onclick = () => revealFold(fold);
      return chip;
    }),
  );
};
