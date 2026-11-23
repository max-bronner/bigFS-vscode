import * as assert from 'assert';
import { mock } from 'node:test';
import { createDebouncer, createKeyedDebouncer } from '../../core/debounce';

suite('Debouncer', () => {
  setup(() => mock.timers.enable({ apis: ['setTimeout'] }));
  teardown(() => mock.timers.reset());

  test('a burst of calls runs once, after the last', () => {
    let runs = 0;
    const debouncer = createDebouncer(() => (runs += 1), 20);

    debouncer.schedule();
    mock.timers.tick(15);
    debouncer.schedule();
    mock.timers.tick(15);
    assert.strictEqual(runs, 0);

    mock.timers.tick(5);
    assert.strictEqual(runs, 1);
  });

  test('a cancelled run does not happen', () => {
    let runs = 0;
    const debouncer = createDebouncer(() => (runs += 1), 10);

    debouncer.schedule();
    debouncer.cancel();
    mock.timers.tick(20);

    assert.strictEqual(runs, 0);
  });

  test('a burst on one key runs once with the last item, other keys run on their own', () => {
    const seen: string[] = [];
    const debouncer = createKeyedDebouncer<{ key: string; text: string }>(
      (item) => seen.push(`${item.key}:${item.text}`),
      20,
      (item) => item.key,
    );

    debouncer.schedule({ key: 'a', text: '1' });
    debouncer.schedule({ key: 'a', text: '2' });
    debouncer.schedule({ key: 'b', text: '1' });
    debouncer.schedule({ key: 'a', text: '3' });
    mock.timers.tick(20);

    assert.deepStrictEqual(seen.sort(), ['a:3', 'b:1']);
  });

  test('a cancelled key does not run, and dispose drops every key', () => {
    const seen: string[] = [];
    const debouncer = createKeyedDebouncer<string>(
      (item) => seen.push(item),
      20,
      (item) => item,
    );

    debouncer.schedule('a');
    debouncer.schedule('b');
    debouncer.cancel('a');
    mock.timers.tick(20);
    debouncer.schedule('c');
    debouncer.dispose();
    mock.timers.tick(20);

    assert.deepStrictEqual(seen, ['b']);
  });
});
