import * as assert from 'assert';
import { computeFacingAxes, turnVertices } from '../../formats/w3d/w3dFacing';
import type { Vec3 } from '../../formats/w3d/w3dPose';
import { parseW3d } from '../../formats/w3d/w3dTools';
import { buildW3dScene } from '../../formats/w3d/w3dScene';
import { createToolRegistry } from '../../core/toolRegistry';
import {
  buildChunk,
  concatBytes,
  encodeFloats,
  encodeName,
  encodeUints,
  hierarchy,
  hlod,
} from './w3dSynth';

const UP: Vec3 = [0, 0, 1];
const round = (values: ArrayLike<number>) =>
  Array.from(values, (value) => Math.round(value * 1e4) / 1e4 + 0);

suite('W3D meshes that face the camera', () => {
  test('the geometry type says how a mesh turns', () => {
    const build = (attributes: number) => {
      const header = new Uint8Array(116);

      new DataView(header.buffer).setUint32(4, attributes, true);
      header.set(new TextEncoder().encode('GLOW'), 8);

      return parseW3d(
        buildChunk(
          0,
          concatBytes(
            buildChunk(0x1f, header),
            buildChunk(2, encodeFloats(0, -1, 0, 0, 1, 0, 0, 0, 1)),
            buildChunk(0x20, encodeUints(0, 1, 2, 0, 0, 0, 0, 0)),
          ),
          true,
        ),
      ).meshes[0].facing;
    };

    assert.strictEqual(build(0x00060000), 'oriented');
    assert.strictEqual(build(0x00010000), 'aligned');
    assert.strictEqual(build(0x00002000), undefined);
  });

  test('a card on a bone turns about the bone, and one with no vertices is still shown', async () => {
    const build = (vertices: number[]) => {
      const header = new Uint8Array(116);

      new DataView(header.buffer).setUint32(4, 0x00060000, true);
      header.set(encodeName('BODY', 16), 8);
      header.set(encodeName('UNIT', 16), 24);

      return buildW3dScene(
        concatBytes(
          buildChunk(
            0,
            concatBytes(
              buildChunk(0x1f, header),
              buildChunk(2, encodeFloats(...vertices)),
              buildChunk(0x20, new Uint8Array()),
            ),
            true,
          ),
          hlod,
        ),
        async (fileName) => (fileName === 'UNIT_SKL.w3d' ? hierarchy : undefined),
        createToolRegistry(),
      );
    };

    assert.deepStrictEqual((await build([0, -1, 0, 0, 1, 0, 0, 0, 1])).meshes[0].facing?.origin, [0, 0, 10]);

    const empty = await build([]);

    assert.strictEqual(empty.meshes[0].facing?.kind, 'oriented');
    assert.deepStrictEqual(empty.meshes[0].facing?.origin, [0, 0, 0]);
  });

  test('a card built across X shows the same face from every side, upright, about its own origin', () => {
    const origin: Vec3 = [5, 0, 2];
    const stored = {
      positions: Float32Array.of(0, -1, 0, 0, 1, 0, 0, 0, 1),
      normals: Float32Array.of(1, 0, 0, 1, 0, 0, 1, 0, 0),
    };

    for (const towards of [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]] as Vec3[]) {
      const eye = origin.map((axis, at) => axis + towards[at] * 10) as Vec3;
      const axes = computeFacingAxes('oriented', origin, { eye, backward: [0, 0, 1], up: UP });
      const positions = new Float32Array(9);
      const normals = new Float32Array(9);

      turnVertices(stored, origin, axes, positions, normals);
      assert.deepStrictEqual(round(normals.subarray(0, 3)), round(towards));
      assert.deepStrictEqual(round(positions.subarray(6)), [5, 0, 3]);
    }
  });

  test('an aligned card ignores where the eye is, and one seen from straight above keeps Y', () => {
    const camera = { eye: [9, 9, 9] as Vec3, backward: [0, -1, 0] as Vec3, up: UP };

    assert.deepStrictEqual(round(computeFacingAxes('aligned', [0, 0, 0], camera)[0]), [0, -1, 0]);

    const [x, y] = computeFacingAxes('oriented', [0, 0, 0], { ...camera, eye: [0, 0, 8] });

    assert.deepStrictEqual(round(x), [0, 0, 1]);
    assert.deepStrictEqual(round(y), [0, 1, 0]);
  });
});
