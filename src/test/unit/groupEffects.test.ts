import * as assert from 'assert';
import { describeBones, groupEffects } from '../../webview/particles/groupEffects';
import type { ListedEffect } from '../../game/objects/listStateEffects';

const onBone = (name: string, bone: string, extra: Partial<ListedEffect> = {}): ListedEffect => ({
  kind: 'system',
  name,
  bone,
  detail: `on ${bone}, with the animation`,
  ...extra,
});

suite('Effect groups', () => {
  test('a numbered run of bones is written as one range', () => {
    assert.strictEqual(describeBones(['BN_FIRE000', 'BN_FIRE001', 'BN_FIRE002']), 'BN_FIRE000–002');
    assert.strictEqual(describeBones(['Fire08', 'Fire09', 'Fire10']), 'Fire08–10');
  });

  test('bones that are no run are named, a long list cut short', () => {
    assert.strictEqual(describeBones(['EYE_L', 'EYE_R']), 'EYE_L, EYE_R');
    assert.strictEqual(describeBones(['B01', 'B03']), 'B01, B03');
    assert.strictEqual(describeBones(['A1', 'B1', 'C1', 'D1', 'E1']), 'A1, B1, C1 and 2 more');
    assert.strictEqual(describeBones(['ONLY01']), 'ONLY01');
  });

  test('the same effect on several bones is one row, in the order first met', () => {
    const effects = [
      onBone('Smoke', 'BN_FIRE000'),
      onBone('Fire', 'BN_FIRE000'),
      onBone('Smoke', 'BN_FIRE001'),
      onBone('Smoke', 'BN_FIRE002'),
      onBone('Fire', 'BN_FIRE001'),
    ];
    const groups = groupEffects(effects);

    assert.deepStrictEqual(
      groups.map((group) => [group.effects.map((each) => each.bone), group.detail]),
      [
        [['BN_FIRE000', 'BN_FIRE001', 'BN_FIRE002'], 'on BN_FIRE000–002, with the animation'],
        [['BN_FIRE000', 'BN_FIRE001'], 'on BN_FIRE000–001, with the animation'],
      ],
    );
    assert.strictEqual(groups[0].effects[1], effects[2]);
  });

  test('effects started otherwise, on another part or on another frame, stay apart', () => {
    const groups = groupEffects([
      onBone('Smoke', 'B01'),
      onBone('Smoke', 'B02', { part: 'Tower' }),
      onBone('Smoke', 'B03', { frame: 10, detail: 'on B03, at frame 10 of the clip' }),
      { kind: 'fxList', name: 'Smoke', detail: 'as the clip starts' },
      { kind: 'fxList', name: 'Smoke', detail: 'as the clip starts' },
    ]);

    assert.strictEqual(groups.length, 5);
    assert.strictEqual(groups[3].detail, 'as the clip starts');
  });
});
