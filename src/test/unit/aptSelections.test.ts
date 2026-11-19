import * as assert from 'assert';
import { AptSelections } from '../../features/apt/aptSelections';

suite('APT selections', () => {
  const recorder = () => {
    const selected: number[] = [];

    return { selected, select: async (character: number) => void selected.push(character) };
  };

  test('a selection requested before the page is drawn is delivered when it is', async () => {
    const selections = new AptSelections();
    const page = recorder();

    await selections.request('movie-a', 7);
    assert.deepStrictEqual(page.selected, []);
    await selections.markDrawn('movie-a', page.select);
    assert.deepStrictEqual(page.selected, [7]);
  });

  test('a selection is delivered once, not again on a redraw', async () => {
    const selections = new AptSelections();
    const page = recorder();

    await selections.request('movie-a', 7);
    await selections.markDrawn('movie-a', page.select);
    await selections.markDrawn('movie-a', page.select);
    assert.deepStrictEqual(page.selected, [7]);
  });

  test('a selection for a drawn page is delivered at once', async () => {
    const selections = new AptSelections();
    const page = recorder();

    await selections.markDrawn('movie-a', page.select);
    await selections.request('movie-a', 3);
    assert.deepStrictEqual(page.selected, [3]);
  });

  test('a selection waits for its own movie only', async () => {
    const selections = new AptSelections();
    const other = recorder();

    await selections.request('movie-a', 7);
    await selections.markDrawn('movie-b', other.select);
    assert.deepStrictEqual(other.selected, []);
  });

  test('a closed movie neither keeps a waiting selection nor takes one', async () => {
    const selections = new AptSelections();
    const page = recorder();

    await selections.request('movie-a', 7);
    selections.forget('movie-a');
    await selections.markDrawn('movie-a', page.select);
    assert.deepStrictEqual(page.selected, []);

    selections.forget('movie-a');
    await selections.request('movie-a', 2);
    assert.deepStrictEqual(page.selected, []);
  });
});
