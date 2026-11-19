import * as assert from 'assert';
import { showNotice } from '../../webview/shared/noticeBar';

suite('showNotice', () => {
  const realTimeout = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const scope = globalThis as unknown as Record<string, unknown>;
  const realDocument = scope.document;

  teardown(() => {
    globalThis.setTimeout = realTimeout;
    globalThis.clearTimeout = realClear;
    scope.document = realDocument;
  });

  test('a second notice is not hidden by the timer of the first', () => {
    const notice = { textContent: '', hidden: true };
    const timers = new Map<number, () => void>();
    let next = 1;

    scope.document = { getElementById: () => notice };
    globalThis.setTimeout = ((run: () => void) => {
      timers.set(next, run);
      return next++;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id: number) => {
      timers.delete(id);
    }) as unknown as typeof clearTimeout;

    showNotice('first');
    showNotice('second');
    assert.strictEqual(timers.size, 1);
    timers.forEach((run) => run());
    assert.strictEqual(notice.hidden, true);
    assert.strictEqual(notice.textContent, 'second');
  });
});
