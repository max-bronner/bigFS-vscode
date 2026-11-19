import { sendEdit } from './messaging';
import { turnAngle } from './mapModel';
import type { ObjectView } from './protocol';
import { state } from './state';

export const ROTATE_STEP = Math.PI / 12;

export const rotateBy = (object: ObjectView, step: number): void => {
  sendEdit({
    kind: 'object',
    index: object.index,
    angle: turnAngle(object.angle, step),
  });
};

export const deleteSelected = (): void => {
  if (state.readOnly) {
    return;
  }
  if (state.selected !== undefined && state.map.objects[state.selected]) {
    const index = state.selected;

    state.selected = undefined;
    sendEdit({ kind: 'objectDelete', index });
  } else if (state.selectedArea !== undefined) {
    const index = state.selectedArea;

    state.selectedArea = undefined;
    sendEdit({ kind: 'areaDelete', index });
  }
};

export const toggleLink = (from: number, to: number, present: boolean): void =>
  sendEdit({ kind: 'waypointLink', from, to, present });
