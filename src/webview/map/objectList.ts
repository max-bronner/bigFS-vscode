import { element } from '../shared/element';
import type { MapActions } from './actions';
import { objectList } from './elements';
import { filterObjects, getObjectName } from './mapModel';
import { state } from './state';

const MAX_LISTED = 500;

export const showObjects = (actions: MapActions): void => {
  const matches = filterObjects(state.map.objects, state.filter);

  document.getElementById('objectCount')!.textContent =
    `${matches.length} of ${state.map.objects.length}`;
  objectList.replaceChildren(
    ...matches.slice(0, MAX_LISTED).map((object) => {
      const row = element(
        'div',
        undefined,
        `object${state.selected === object.index ? ' selected' : ''}`,
      );

      row.dataset.index = String(object.index);

      row.append(element('span', object.template), element('span', getObjectName(object), 'muted'));
      row.onclick = () => actions.select(object.index);
      return row;
    }),
  );
  if (matches.length > MAX_LISTED) {
    objectList.append(element('p', 'Showing 500; filter to narrow.', 'muted'));
  }
};

export const markSelectedObject = (previous: number | undefined): void => {
  const rowOf = (index: number | undefined) =>
    index === undefined
      ? null
      : objectList.querySelector<HTMLElement>(`[data-index="${index}"]`);

  rowOf(previous)?.classList.remove('selected');
  rowOf(state.selected)?.classList.add('selected');
};
