import * as assert from 'assert';
import { readW3dHeader } from '../../formats/w3d/readW3dHeader';
import {
  findRelatedModels,
  listRigCandidates,
  readAnimationValue,
} from '../../game/objects/findRelatedModels';
import type { RelatedModel } from '../../game/objects/findRelatedModels';
import type { ObjectScene } from '../../game/objects/objectScene';
import { chooseRelatedStep } from '../../webview/preview/chooseRelatedStep';
import { buildChunk, concatBytes, encodeName, encodeUints } from './w3dSynth';
import { toScene } from './objectFixtures';

const model = (name: string, hierarchy: string) =>
  buildChunk(
    0x700,
    buildChunk(
      0x701,
      concatBytes(encodeUints(0, 1), encodeName(name, 16), encodeName(hierarchy, 16)),
    ),
    true,
  );

const animation = (name: string, hierarchy: string, compressed = false) =>
  buildChunk(
    compressed ? 0x280 : 0x200,
    buildChunk(
      compressed ? 0x281 : 0x201,
      concatBytes(
        encodeUints(0),
        encodeName(name, 16),
        encodeName(hierarchy, 16),
        encodeUints(10, 30),
      ),
    ),
    true,
  );

const skeleton = (name: string) =>
  buildChunk(
    0x100,
    buildChunk(0x101, concatBytes(encodeUints(0), encodeName(name, 16), encodeUints(0), new Uint8Array(12))),
    true,
  );

const FILES: Record<string, Uint8Array> = {
  'tu_skl.w3d': skeleton('TU_SKL'),
  'tu_skn.w3d': model('TU_SKN', 'TU_SKL'),
  'tu_dmg_skn.w3d': model('TU_DMG_SKN', 'TU_SKL'),
  'tu_runa.w3d': animation('TU_RUNA', 'TU_SKL'),
  'tu_atka.w3d': animation('TU_ATKA', 'TU_SKL', true),
  'tu_rider_skn.w3d': model('TU_RIDER_SKN', 'TUR_SKL'),
  'tu_cart.w3d': model('TU_CART', 'CART_SKL'),
  'cart_skl.w3d': skeleton('CART_SKL'),
  'cart_roll.w3d': animation('CART_ROLL', 'CART_SKL'),
  'other_skn.w3d': model('OTHER_SKN', 'OTHER_SKL'),
};

const INI = [
  'Object TestUnit',
  '  Draw = W3DScriptedModelDraw ModuleTag_Draw',
  '    DefaultModelConditionState',
  '      Model = TU_SKN',
  '    End',
  '    ModelConditionState = REALLYDAMAGED',
  '      Model = TU_DMG_SKN',
  '    End',
  '    ModelConditionState = USER_1',
  '      Model = TU_Cart',
  '    End',
  '    IdleAnimationState',
  '      Animation = Idle',
  '        AnimationName = TU_SKL.TU_RUNA',
  '      End',
  '    End',
  '    AnimationState = MOVING USER_1',
  '      Animation = Roll',
  '        AnimationName = CART_SKL.CART_ROLL',
  '      End',
  '    End',
  '  End',
  'End',
];

const scene = toScene(INI);

const read = (file: string) => FILES[file] && readW3dHeader(FILES[file]);
const sources = (scenes: Record<string, ObjectScene[]>, reads: string[] = []) => ({
  readHeader: async (file: string) => {
    reads.push(file);
    return read(file);
  },
  listNames: async () => Object.keys(FILES),
  findScenes: async (file: string) => scenes[file] ?? [],
});
const summarise = (files: RelatedModel[]) =>
  files.map((entry) => [entry.file, entry.kind, entry.hierarchy, entry.uses.map((use) => use.state), entry.model]);

suite('Related models', () => {
  test('a header tells model, skeleton and animation apart, with the hierarchy each names', () => {
    assert.deepStrictEqual(readW3dHeader(FILES['tu_skn.w3d']), { kind: 'model', hierarchy: 'TU_SKL' });
    assert.deepStrictEqual(readW3dHeader(FILES['tu_skl.w3d']), { kind: 'skeleton', hierarchy: 'TU_SKL' });
    assert.deepStrictEqual(readW3dHeader(FILES['tu_runa.w3d']), { kind: 'animation', hierarchy: 'TU_SKL' });
    assert.deepStrictEqual(readW3dHeader(FILES['tu_atka.w3d']), { kind: 'animation', hierarchy: 'TU_SKL' });
    assert.deepStrictEqual(readW3dHeader(new Uint8Array(0)), { kind: 'other' });
    assert.throws(() => readW3dHeader(Buffer.from([0, 7, 0, 0, 0xff, 0, 0, 0])));
  });

  test('an animation value splits into its file and hierarchy', () => {
    assert.deepStrictEqual(readAnimationValue('TU_SKL.TU_RUNA'), { file: 'tu_runa.w3d', hierarchy: 'TU_SKL' });
    assert.deepStrictEqual(readAnimationValue('TU_RUNA'), { file: 'tu_runa.w3d', hierarchy: undefined });
  });

  test('rig candidates are the skeleton names, then the files named after the stem', () => {
    assert.deepStrictEqual(listRigCandidates('TU_SKL', 'tu_skn.w3d', Object.keys(FILES)), [
      'tu_skl.w3d',
      'tu_skl_skl.w3d',
      'tu_atka.w3d',
      'tu_cart.w3d',
      'tu_dmg_skn.w3d',
      'tu_rider_skn.w3d',
      'tu_runa.w3d',
    ]);
  });

  test('a model gathers its draw module states and the models on its hierarchy, not the unnamed clips', async () => {
    const found = await findRelatedModels('TU_SKN.w3d', read('tu_skn.w3d'), sources({ 'tu_skn.w3d': [scene] }));

    assert.deepStrictEqual(summarise(found), [
      ['tu_cart.w3d', 'model', 'CART_SKL', ['ModelConditionState = USER_1'], undefined],
      ['tu_dmg_skn.w3d', 'model', 'TU_SKL', ['ModelConditionState = REALLYDAMAGED'], undefined],
      ['tu_skl.w3d', 'skeleton', 'TU_SKL', [], undefined],
      ['cart_roll.w3d', 'animation', 'CART_SKL', ['AnimationState = MOVING USER_1'], 'tu_skn.w3d'],
      ['tu_runa.w3d', 'animation', 'TU_SKL', ['IdleAnimationState'], 'tu_skn.w3d'],
    ]);
  });

  test('a file named like the rig but drawn on another skeleton is left out', async () => {
    const found = await findRelatedModels('tu_skn.w3d', read('tu_skn.w3d'), sources({}));

    assert.ok(!found.some((entry) => entry.file === 'tu_rider_skn.w3d'));
    assert.ok(!found.some((entry) => entry.file === 'other_skn.w3d'));
  });

  test('a skeleton with no INI of its own reads the objects of its skinned model', async () => {
    const found = await findRelatedModels('tu_skl.w3d', read('tu_skl.w3d'), sources({ 'tu_skn.w3d': [scene] }));

    assert.deepStrictEqual(
      found.map((entry) => entry.file),
      ['tu_cart.w3d', 'tu_dmg_skn.w3d', 'tu_skn.w3d', 'cart_roll.w3d', 'tu_runa.w3d'],
    );
  });

  test('a model with no skeleton and no INI has nothing related, and reads nothing', async () => {
    const reads: string[] = [];
    const found = await findRelatedModels('lone.w3d', { kind: 'model' }, sources({}, reads));

    assert.deepStrictEqual(found, []);
    assert.deepStrictEqual(reads, []);
  });

  test('an animation plays on a model of its rig, and switches to its own model otherwise', () => {
    const [cartRoll, runa] = [
      { file: 'cart_roll.w3d', kind: 'animation', hierarchy: 'CART_SKL', uses: [], model: 'tu_cart.w3d' },
      { file: 'tu_runa.w3d', kind: 'animation', hierarchy: 'TU_SKL', uses: [], model: 'tu_skn.w3d' },
    ] as RelatedModel[];
    const onSkin = { file: 'tu_dmg_skn.w3d', openedFile: 'tu_skn.w3d', hierarchy: 'TU_SKL' };

    assert.deepStrictEqual(chooseRelatedStep(runa, onSkin), { kind: 'play', file: 'tu_runa.w3d' });
    assert.deepStrictEqual(chooseRelatedStep(cartRoll, onSkin), {
      kind: 'showThenPlay',
      model: 'tu_cart.w3d',
      file: 'cart_roll.w3d',
    });
    assert.deepStrictEqual(
      chooseRelatedStep(runa, { file: 'tu_cart.w3d', openedFile: 'tu_skn.w3d', hierarchy: 'CART_SKL' }),
      { kind: 'showThenPlay', model: undefined, file: 'tu_runa.w3d' },
    );
    assert.deepStrictEqual(
      chooseRelatedStep({ file: 'tu_skn.w3d', kind: 'model', uses: [] }, onSkin),
      { kind: 'show', file: undefined },
    );
  });
});
