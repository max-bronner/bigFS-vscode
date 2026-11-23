import * as assert from 'assert';
import { createToolRegistry } from '../../core/toolRegistry';
import { decodeTgaTool } from '../../formats/texture/textureTools';
import type { ModelScene } from '../../formats/w3d/w3dScene';
import {
  countTextureBytes,
  createSceneReceiver,
  createSceneSender,
} from '../../formats/w3d/w3dSceneTransfer';
import { listAppearanceControls } from '../../game/objects/appearanceControls';
import { createPicks, getChoice, listNextChoices } from '../../game/objects/appearancePicks';
import { listPreloads } from '../../game/objects/listPreloads';
import { listAppearanceOptions } from '../../game/objects/objectAppearance';
import { composeObject } from '../../game/objects/objectComposition';
import { createDecodeCache } from '../../node/decodeCache';
import { toObject } from './objectFixtures';

const toScene = (...pixels: Uint8Array[]) =>
  ({
    meshes: [],
    textures: pixels.map((each) => ({ width: 1, height: 1, pixels: each })),
  }) as unknown as ModelScene;

const toTga = (blue: number) =>
  Buffer.from([0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 32, 0x28, blue, 2, 3, 255]);

suite('Model preloading', () => {
  test('pixels cross once, and scenes that share an atlas share its image', () => {
    const atlas = Uint8Array.of(1, 2, 3, 4);
    const sender = createSceneSender(({ pixels }) => String(pixels));
    const receiver = createSceneReceiver();
    const first = sender.send(toScene(atlas)).scene;
    const second = sender.send(toScene(Uint8Array.from(atlas), Uint8Array.of(9, 9, 9, 9))).scene;

    assert.ok(first.textures[0].image);
    assert.strictEqual(second.textures[0].image, undefined);

    const shown = receiver.receive(first);
    const next = receiver.receive(second);

    assert.strictEqual(next.textures[0], shown.textures[0]);
    assert.strictEqual(countTextureBytes([shown, next]), 8);
  });

  test('the budget counts what the models kept still hold, not every byte received', () => {
    const sender = createSceneSender(({ pixels }) => String(pixels));
    const receiver = createSceneReceiver();
    const kept = receiver.receive(sender.send(toScene(Uint8Array.of(1, 1, 1, 1))).scene);

    receiver.receive(sender.send(toScene(Uint8Array.of(2, 2, 2, 2), Uint8Array.of(3, 3, 3, 3))).scene);
    assert.strictEqual(countTextureBytes([kept]), 4, 'the second model was evicted');
  });

  test('sender and receiver forgotten together send the pixels again', () => {
    const atlas = Uint8Array.of(1, 2, 3, 4);
    const sender = createSceneSender(({ pixels }) => String(pixels));
    const receiver = createSceneReceiver();

    receiver.receive(sender.send(toScene(atlas)).scene);
    sender.reset();
    receiver.reset();

    const again = receiver.receive(sender.send(toScene(Uint8Array.from(atlas))).scene);

    assert.deepStrictEqual([...again.textures[0].pixels], [1, 2, 3, 4]);
  });

  test('past its budget the sender starts over with the pixels', () => {
    const sender = createSceneSender(({ pixels }) => String(pixels), 4);

    sender.send(toScene(Uint8Array.of(1, 1, 1, 1)));

    const again = sender.send(toScene(Uint8Array.of(1, 1, 1, 1)));

    assert.strictEqual(again.startsOver, true);
    assert.ok(again.scene.textures[0].image);
  });

  test('equal bytes decode once and a changed file again', async () => {
    let decodes = 0;
    const base = createToolRegistry();

    base.register({
      id: decodeTgaTool.id,
      run: (bytes: Uint8Array, tools) => {
        decodes++;
        return decodeTgaTool.run(bytes, tools);
      },
    } as typeof decodeTgaTool as never);

    const cache = createDecodeCache(base, () => assert.fail('no PNG here'));
    const decode = async (bytes: Uint8Array) => (await cache.tools.use(decodeTgaTool)(bytes)).levels[0];
    const first = await decode(toTga(1));

    assert.strictEqual(await decode(toTga(1)), first);
    assert.notStrictEqual(cache.getDigest(await decode(toTga(7))), cache.getDigest(first));
    assert.strictEqual(decodes, 2);
  });

  test('every look one press away is planned, unseen parts included', async () => {
    const lines = [
      'Object TestKeep',
      '  Draw = W3DScriptedModelDraw ModuleTag_Body',
      '    DefaultModelConditionState',
      '      Model = TK_SKN',
      '    End',
      '    ModelConditionState = DAMAGED',
      '      Model = TK_D1',
      '    End',
      '    ModelConditionState = SNOW',
      '      Texture = TKeep.tga TKeep_Snow.tga',
      '    End',
      '  End',
      '  Draw = W3DScriptedModelDraw ModuleTag_Tower',
      '    DefaultModelConditionState',
      '      Model = None',
      '    End',
      '    ModelConditionState = UPGRADE_TOWER',
      '      Model = TT_SKN',
      '    End',
      '  End',
      '  Behavior = ModelConditionUpgrade ModuleTag_Upgrade',
      '    TriggeredBy = Upgrade_Tower',
      '    AddConditionFlags = UPGRADE_TOWER',
      '  End',
      'End',
    ];
    const object = toObject(lines);
    const { scene } = object;
    const picks = createPicks();
    const controls = listAppearanceControls(scene, listAppearanceOptions([scene]));
    const next = listNextChoices(controls, picks);
    const compositions = await Promise.all(
      next.map((choice) =>
        composeObject(
          object,
          { readObject: () => Promise.resolve(undefined), resolveMacro: () => undefined },
          [],
          choice,
        ),
      ),
    );
    const { models } = listPreloads(scene, compositions, getChoice(controls, picks));
    const looks = models.map(({ name, textures }) =>
      [name, ...textures.flat().map((swap) => swap.to)].join(' '),
    );

    assert.deepStrictEqual(
      [...new Set(looks)].sort(),
      ['TK_D1', 'TK_SKN', 'TK_SKN TKeep_Snow.tga', 'TT_SKN'],
    );
    assert.deepStrictEqual(picks, createPicks(), 'what is picked is left as it was');
  });
});
