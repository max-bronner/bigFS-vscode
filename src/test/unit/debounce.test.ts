import * as assert from 'assert';
import { createKeyedDebouncer } from '../../core/debounce';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

suite('keyed debouncer', () => {
  test('a burst on one key runs once with the last item, other keys run on their own', async () => {
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
    await sleep(80);

    assert.deepStrictEqual(seen.sort(), ['a:3', 'b:1']);
  });

  test('a cancelled key does not run', async () => {
    const seen: string[] = [];
    const debouncer = createKeyedDebouncer<string>(
      (item) => seen.push(item),
      20,
      (item) => item,
    );

    debouncer.schedule('a');
    debouncer.schedule('b');
    debouncer.cancel('a');
    await sleep(60);
    debouncer.dispose();

    assert.deepStrictEqual(seen, ['b']);
  });
});
