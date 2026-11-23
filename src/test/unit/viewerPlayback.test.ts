import * as assert from 'assert';
import { advancePlayhead } from '../../webview/shared/viewer/advancePlayhead';
import { getClipFrame, getClipSeconds } from '../../webview/shared/viewer/clipTiming';
import { buildGridLines } from '../../webview/shared/viewer/buildGridLines';
import { computeOrbitBasis } from '../../webview/shared/orbitBasis';
import { describeDetailLevels, describeModel } from '../../webview/shared/viewer/describeModel';
import type { ViewerModel } from '../../webview/shared/viewer/describeModel';
import { listFileClips } from '../../webview/preview/listFileClips';
import { createClipRequests } from '../../webview/particles/createClipRequests';

const CLIP = { frameCount: 31, frameRate: 30 };

const VERTEX_FLOATS = 7;

const model = (fields: Partial<ViewerModel>): ViewerModel => ({
  meshes: [],
  boxes: [],
  textures: [],
  missing: [],
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
  ...fields,
});

suite('Viewer playback', () => {
  test('the playhead runs on, loops or stops at the end, and an effect still running holds the end back', () => {
    assert.deepStrictEqual(advancePlayhead(1, 0.5, 2, false, true), { time: 1.5, hasWrapped: false, hasEnded: false });
    assert.deepStrictEqual(advancePlayhead(1.9, 0.5, 2, false, true), { time: 0, hasWrapped: true, hasEnded: false });
    assert.deepStrictEqual(advancePlayhead(1.9, 0.5, 2, false, false), { time: 2, hasWrapped: false, hasEnded: true });
    assert.deepStrictEqual(advancePlayhead(1.9, 0.5, 2, true, true), { time: 2.4, hasWrapped: false, hasEnded: false });
  });

  test('with no length, as for materials alone, it never ends', () => {
    assert.deepStrictEqual(advancePlayhead(100, 1, 0, false, false), { time: 101, hasWrapped: false, hasEnded: false });
  });

  test('a clip lasts its frame span, even at a frame rate of zero', () => {
    assert.strictEqual(getClipSeconds(CLIP), 1);
    assert.strictEqual(getClipSeconds({ frameCount: 11, frameRate: 0 }), 10);
  });

  test('a clip stands at seconds times its rate, from its first frame to its last, and loops', () => {
    assert.deepStrictEqual([0, 0.5, 1, 1.5].map((seconds) => getClipFrame(CLIP, seconds)), [0, 15, 30, 15]);
  });

  test('a clip played once holds its last frame, and stands on its first before it starts', () => {
    assert.strictEqual(getClipFrame(CLIP, 1.5, true), 30);
    assert.strictEqual(getClipFrame(CLIP, -0.5, true), 0);
  });
});

suite('Viewer animation list', () => {
  test("the file's own clips come first, then its skeleton's, then another skeleton's labelled with it", () => {
    const thisFile = [{ id: '#own', label: 'CLIP (this file)' }];
    const clips = listFileClips(thisFile, ['a_run.W3D'], [{ file: 'b_run.w3d', hierarchyName: 'B_SKL' }]);

    assert.deepStrictEqual(clips.own, [thisFile[0], { id: 'a_run.W3D', label: 'a_run' }]);
    assert.deepStrictEqual(clips.foreign, [{ id: 'b_run.w3d', label: 'b_run (B_SKL)' }]);
  });
});

suite('Viewer grid', () => {
  const reach = (lines: number[]) => Math.max(...lines.filter((_, at) => at % VERTEX_FLOATS === 0));

  test('a small scene gets the 200 unit grid, and a large one a wider grid of as many lines', () => {
    const small = buildGridLines(10);
    const large = buildGridLines(1000);

    assert.strictEqual(reach(small), 200);
    assert.ok(reach(large) >= 1500);
    assert.strictEqual(large.length, small.length);
  });

  test('a radius from a broken file cannot hang it', () => {
    assert.ok(buildGridLines(Number.POSITIVE_INFINITY).length > 0);
  });
});

suite('Viewer camera', () => {
  test('the eye stands at its distance looking at the target, up leaning to Z and right level', () => {
    const target = [1, 2, 3];
    const { eye, forward, up, right } = computeOrbitBasis({ yaw: 0.3, pitch: 0.4, distance: 10, target: [1, 2, 3] });

    assert.ok(Math.abs(Math.hypot(eye[0] - 1, eye[1] - 2, eye[2] - 3) - 10) < 1e-9);
    target.forEach((axis, at) => assert.ok(Math.abs(eye[at] + forward[at] * 10 - axis) < 1e-9));
    assert.ok(up[2] > 0);
    assert.ok(Math.abs(right[2]) < 1e-9);
  });
});

suite('Viewer model facts', () => {
  test('says what could not be found and what it is shown on, and nothing of detail levels without an HLOD', () => {
    const text = describeModel(model({ missing: ['a.tga'], shownOn: 'carrier.w3d' }));

    assert.ok(text.includes('textures not found: a.tga'));
    assert.ok(text.startsWith('shown on carrier.w3d'));
    assert.strictEqual(describeDetailLevels(model({})), '');
  });

  test('a clip that arrives after a newer pick does not play over it', () => {
    const asked: string[] = [];
    const requests = createClipRequests((name) => asked.push(name));

    requests.ask('Big_Clip');
    requests.ask('Big_Clip');
    requests.ask('Small_Clip');
    assert.deepStrictEqual(asked, ['Big_Clip', 'Small_Clip']);
    assert.strictEqual(requests.receive('Small_Clip', 'Small_Clip'), true);
    assert.strictEqual(requests.receive('Big_Clip', 'Small_Clip'), false);
    assert.strictEqual(requests.receive('Other_Clip', 'Small_Clip'), false);

    requests.ask('Big_Clip');
    assert.deepStrictEqual(asked, ['Big_Clip', 'Small_Clip', 'Big_Clip']);
  });
});
