import * as assert from 'assert';
import { isAttachmentBone } from '../../formats/w3d/isAttachmentBone';
import { listAttachmentJoints, poseAt } from '../../formats/w3d/w3dPose';
import type { SceneSkeleton } from '../../formats/w3d/w3dScene';
import { projectToScreen } from '../../webview/shared/viewer/projectToScreen';

const skeleton: SceneSkeleton = {
  name: 'RIG_SKL',
  names: ['ROOTTRANSFORM', 'BAT_SPINE', 'FIREPOINT01', 'B_HANDR', 'WEAPON_L'],
  parents: [-1, 0, 1, 1, 3],
  translations: [0, 0, 0, 0, 0, 10, 0, 2, 4, 3, 0, 0, 1, 0, 0],
  rotations: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
};

suite('Skeleton view', () => {
  test('attachment bones are told by the words retail pivots use', () => {
    assert.deepStrictEqual(
      ['FIREPOINT01', 'Muzzle', 'PASSENGERBONE', 'B_FLAG', 'FXBONE', 'DOCKSTART', 'BAT_SPINE', 'B_HANDR', 'ROOTTRANSFORM'].map(
        isAttachmentBone,
      ),
      [true, true, true, true, true, true, false, false, false],
    );
  });

  test('the attachment joints follow the pose, in model space', () => {
    const pose = poseAt(skeleton);

    assert.deepStrictEqual(listAttachmentJoints(skeleton, pose), [0, 2, 14, 4, 0, 10]);
  });

  test('a point projects through a column-major matrix onto the canvas', () => {
    const matrix = [
      0.5, 0, 0, 0,
      0, 0.5, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];

    assert.deepStrictEqual(projectToScreen(matrix, [0, 0, 0], 200, 100), [100, 50]);
    assert.deepStrictEqual(projectToScreen(matrix, [2, 2, 0], 200, 100), [200, 0]);

    const behind = [...matrix];

    behind[15] = -1;
    assert.strictEqual(projectToScreen(behind, [0, 0, 0], 200, 100), undefined);
  });
});
