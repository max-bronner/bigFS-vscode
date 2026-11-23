import * as assert from 'assert';
import type { ComposedPart } from '../../game/objects/objectComposition';
import { listEarlierDraws } from '../../webview/particles/listEarlierDraws';

const toPart = (id: string, fields: Partial<ComposedPart>): ComposedPart =>
  ({ id, placement: { kind: 'origin' }, ...fields }) as unknown as ComposedPart;

suite('Composed parts', () => {
  test('a part on an attach bone stands on the draw modules listed before it on its owner', () => {
    const body = toPart('body', { draw: 'ModuleTag_Body', model: 'Body_SKN' });
    const empty = toPart('empty', { draw: 'ModuleTag_Empty' });
    const rider = toPart('rider', { parent: 'body', draw: 'ModuleTag_Rider', model: 'Rider_SKN' });
    const flag = toPart('flag', {
      draw: 'ModuleTag_Flag',
      model: 'Flag_SKN',
      placement: { kind: 'attachBone', bone: 'B_FLAG' } as ComposedPart['placement'],
    });
    const tower = toPart('tower', { draw: 'ModuleTag_Tower', model: 'Tower_SKN' });

    const earlier = listEarlierDraws([body, empty, rider, flag, tower]);

    assert.deepStrictEqual([...earlier.keys()], ['flag']);
    assert.deepStrictEqual(earlier.get('flag'), [body]);
  });
});
