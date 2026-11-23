import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { findOwningTemplate } from '../../game/objects/findOwningTemplate';
import { createRequestSequence } from '../../features/preview/createRequestSequence';
import { createRevisionCache } from '../../features/preview/createRevisionCache';
import { loadSageIniSchema } from './loadSageIniSchema';

suite('preview request sequencing', () => {
  test('only the latest request is current', () => {
    const sequence = createRequestSequence();
    const first = sequence.begin();
    const second = sequence.begin();

    assert.strictEqual(first(), false);
    assert.strictEqual(second(), true);
  });
});

suite('revision cache', () => {
  test('computes once per key until the revision changes', () => {
    let revision = 0;
    let computed = 0;
    const cache = createRevisionCache<number>(() => revision);
    const compute = () => ++computed;

    assert.strictEqual(cache.get('a', compute), 1);
    assert.strictEqual(cache.get('a', compute), 1);
    assert.strictEqual(cache.get('b', compute), 2);
    revision++;
    assert.strictEqual(cache.get('a', compute), 3);
  });
});

suite('owning template', () => {
  const schema = loadSageIniSchema();
  const { blocks } = parseSageIni(
    [
      'Object Archer',
      '; a comment at column zero',
      '  KindOf = INFANTRY',
      'End',
      '',
      'Weapon Bow',
      '  PrimaryDamage = 1',
      'End',
    ],
    schema,
  );

  test('finds the object across a column-0 comment', () => {
    assert.strictEqual(findOwningTemplate(blocks, 2)?.name, 'Archer');
  });

  test('is none for another kind of block', () => {
    assert.strictEqual(findOwningTemplate(blocks, 6), undefined);
  });
});
