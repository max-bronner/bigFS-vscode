import type { Vec3 } from '../../formats/w3d/w3dPose';
import { element } from '../shared/element';
import { computeGroundPoint } from '../shared/computeGroundPoint';
import { getModelOrigin, setModelOrigin } from './emitterOrigin';
import { pageSettings, viewer } from './page';

export const attachMove = (): void => {
  const { canvas } = viewer;
  const move = element('button', 'Move');
  const centre = element('button', 'Centre');
  let isMoving = false;
  let drag: { pointer: number; from: Vec3; origin: Vec3 } | undefined;

  move.id = 'moveModel';
  move.title =
    'Move (M): drag to move the model over the ground, and see what it emits trail behind. Shift+drag does it at any time.';
  centre.id = 'centreModel';
  centre.title = 'Put the model back in the middle';
  centre.hidden = true;

  const setMoving = (on: boolean) => {
    isMoving = on;
    pageSettings.set('move', on);
    move.setAttribute('aria-pressed', String(on));
    canvas.style.cursor = on ? 'move' : '';
  };
  const findGround = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();

    return computeGroundPoint(
      viewer.getCamera().basis,
      [
        ((event.clientX - box.left) / box.width) * 2 - 1,
        1 - ((event.clientY - box.top) / box.height) * 2,
      ],
      box.width / box.height,
    );
  };
  const endDrag = () => {
    drag = undefined;
  };

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0 || !(isMoving || event.shiftKey)) {
        return;
      }
      event.stopImmediatePropagation();

      const from = findGround(event);

      if (from) {
        canvas.setPointerCapture(event.pointerId);
        drag = { pointer: event.pointerId, from, origin: getModelOrigin() };
      }
    },
    { capture: true },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (drag?.pointer !== event.pointerId) {
        return;
      }
      event.stopImmediatePropagation();

      const to = findGround(event);

      if (to) {
        setModelOrigin([
          drag.origin[0] + to[0] - drag.from[0],
          drag.origin[1] + to[1] - drag.from[1],
          0,
        ]);
        centre.hidden = false;
      }
    },
    { capture: true },
  );
  canvas.addEventListener('pointerup', endDrag, { capture: true });
  canvas.addEventListener('pointercancel', endDrag, { capture: true });

  move.onclick = () => setMoving(!isMoving);
  centre.onclick = () => {
    setModelOrigin([0, 0, 0]);
    centre.hidden = true;
  };
  setMoving(pageSettings.values.move);
  viewer.addLayer({
    onKey: (key) => {
      if (key !== 'm') {
        return false;
      }
      setMoving(!isMoving);
      return true;
    },
  });
  viewer.toggles.append(move, centre);
};
