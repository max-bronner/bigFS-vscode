import * as assert from 'assert';
import { computeGroundPoint } from '../../webview/shared/computeGroundPoint';
import { computeOrbitBasis } from '../../webview/shared/orbitBasis';

suite('Point on the ground', () => {
  const basis = computeOrbitBasis({ yaw: 0.7, pitch: 0.5, distance: 100, target: [12, -8, 0] });

  test('the middle of the view lies on what the camera looks at', () => {
    const point = computeGroundPoint(basis, [0, 0], 1.5)!;

    assert.deepStrictEqual(point.map((axis) => Math.round(axis) + 0), [12, -8, 0]);
  });

  test('above the horizon there is no ground', () => {
    const level = computeOrbitBasis({ yaw: 0, pitch: 0.02, distance: 100, target: [0, 0, 0] });

    assert.strictEqual(computeGroundPoint(level, [0, 1], 1.5), undefined);
  });
});
