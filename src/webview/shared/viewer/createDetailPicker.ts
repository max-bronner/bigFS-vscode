import { DETAIL_LEVELS } from '../../../game/objects/detailModels';
import type { DetailLevel } from '../../../game/objects/detailModels';
import { element } from '../element';

export interface DetailPicker {
  select: HTMLSelectElement;
  show(levels: readonly DetailLevel[], picked: DetailLevel): void;
}

const LABELS: Record<DetailLevel, string> = {
  high: 'Detail: high',
  medium: 'Detail: medium',
  low: 'Detail: low',
};

export const createDetailPicker = (onPick: (level: DetailLevel) => void): DetailPicker => {
  const select = element('select');

  select.id = 'detailLevel';
  select.title =
    "The game's detail setting: medium and low draw the model's M and L files where there are any";
  select.hidden = true;
  select.onchange = () => onPick(select.value as DetailLevel);

  return {
    select,
    show: (levels, picked) => {
      const offered = DETAIL_LEVELS.filter((level) => levels.includes(level));

      select.hidden = offered.length < 2;
      select.replaceChildren(...offered.map((level) => new Option(LABELS[level], level)));
      select.value = picked;
    },
  };
};
