import * as assert from 'assert';
import { getNextEventStep } from '../../webview/particles/clipEvents';

suite('Clip events', () => {
  const steps = (frame: number, clip?: { frameRate: number; frameCount: number }) => {
    const fired: number[] = [];

    for (let step = 0; step <= 95; step++) {
      if (getNextEventStep(frame, step - 1, 30, clip) === step) {
        fired.push(step);
      }
    }
    return fired;
  };

  test('an event fires on its frame with each loop of the clip', () => {
    assert.deepStrictEqual(steps(7, { frameRate: 30, frameCount: 31 }), [7, 38, 69]);
    assert.deepStrictEqual(steps(5, { frameRate: 15, frameCount: 20 }), [10, 50, 90]);
    assert.deepStrictEqual(steps(0, { frameRate: 30, frameCount: 40 }), [0, 40, 80]);
  });

  test('without a clip, or past its end, it fires once', () => {
    assert.deepStrictEqual(steps(15), [15]);
    assert.deepStrictEqual(steps(50, { frameRate: 30, frameCount: 31 }), [50]);
  });
});
