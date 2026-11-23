import { DETAIL_LEVELS } from '../../game/objects/detailModels';
import type { DetailLevel } from '../../game/objects/detailModels';
import { createDetailPicker } from '../shared/viewer/createDetailPicker';
import { viewer } from './page';

const detail = {
  picked: 'high' as DetailLevel,
  mainHas: false,
  partsHave: false,
  listeners: [] as (() => void)[],
};

const picker = createDetailPicker((level) => {
  detail.picked = level;
  detail.listeners.forEach((listener) => listener());
});

viewer.viewBar.prepend(picker.select);

export const getDetail = (hasDetailModels: boolean | undefined): DetailLevel | undefined =>
  hasDetailModels && detail.picked !== 'high' ? detail.picked : undefined;

export const offerDetail = (who: 'mainHas' | 'partsHave', has: boolean): void => {
  detail[who] = has;
  picker.show(detail.mainHas || detail.partsHave ? DETAIL_LEVELS : [], detail.picked);
};

export const onDetailPicked = (listener: () => void): void => {
  detail.listeners.push(listener);
};
