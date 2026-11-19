import { isAttachmentBone } from '../../../formats/w3d/isAttachmentBone';
import type { Pose, Vec3 } from '../../../formats/w3d/w3dPose';
import type { SceneSkeleton } from '../../../formats/w3d/w3dScene';
import { element } from '../element';
import { projectToScreen } from './projectToScreen';

const HOVER_RADIUS = 10;

export interface BoneLabelFrame {
  skeleton?: SceneSkeleton;
  pose?: Pose;
  matrix: Float32Array;
  offset?: Vec3;
  showAll: boolean;
  showBones: boolean;
}

export interface BoneLabels {
  layer: HTMLElement;
  update(frame: BoneLabelFrame): void;
}

export const createBoneLabels = (
  canvas: HTMLCanvasElement,
  onPointerMove: () => void,
): BoneLabels => {
  const layer = element('div', undefined, 'viewer-bone-labels');
  const labels: HTMLElement[] = [];
  let pointer: [number, number] | undefined;

  canvas.addEventListener('pointermove', (event) => {
    const box = canvas.getBoundingClientRect();

    pointer = [event.clientX - box.left, event.clientY - box.top];
    onPointerMove();
  });
  canvas.addEventListener('pointerleave', () => {
    pointer = undefined;
    onPointerMove();
  });

  const place = (at: number, name: string, [x, y]: [number, number]) => {
    const label = (labels[at] ??= layer.appendChild(
      element('span', undefined, 'viewer-bone-label'),
    ));

    label.textContent = name;
    label.classList.toggle('attachment', isAttachmentBone(name));
    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    label.hidden = false;
  };

  return {
    layer,
    update: ({ skeleton, pose, matrix, offset = [0, 0, 0], showAll, showBones }) => {
      let shown = 0;

      if (showBones && skeleton && pose && (showAll || pointer)) {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const joints = pose.world.map(({ t }) =>
          projectToScreen(
            matrix,
            [t[0] + offset[0], t[1] + offset[1], t[2] + offset[2]],
            width,
            height,
          ),
        );

        if (showAll) {
          joints.forEach((joint, index) => {
            if (joint) {
              place(shown++, skeleton.names[index] ?? `bone ${index}`, joint);
            }
          });
        } else if (pointer) {
          const [px, py] = pointer;
          let nearest = -1;
          let best = HOVER_RADIUS;

          joints.forEach((joint, index) => {
            const distance = joint ? Math.hypot(joint[0] - px, joint[1] - py) : Infinity;

            if (distance <= best) {
              best = distance;
              nearest = index;
            }
          });
          if (nearest >= 0) {
            place(shown++, skeleton.names[nearest] ?? `bone ${nearest}`, joints[nearest]!);
          }
        }
      }
      labels.slice(shown).forEach((label) => {
        label.hidden = true;
      });
    },
  };
};
