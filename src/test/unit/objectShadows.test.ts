import * as assert from 'assert';
import { parseSageIni } from '../../formats/ini/sageIniParser';
import { pickDrawShadow } from '../../game/objects/drawStates';
import { readObjectScene } from '../../game/objects/objectScene';
import {
  DEFAULT_SUN,
  computeGroundProjection,
  getHeightPlane,
  readSunDirection,
  resolveShadowMacros,
} from '../../game/objects/objectShadows';
import { loadSageIniSchema } from './loadSageIniSchema';

const schema = loadSageIniSchema();

const toScene = (shadow: string[], state: string[] = []) => {
  const lines = [
    'Object TestThing',
    '  Draw = W3DScriptedModelDraw ModuleTag_Body',
    '    DefaultModelConditionState',
    '      Model = TT_SKN',
    '    End',
    '    ModelConditionState = USER_1',
    '      Model = TT_SKN',
    ...state,
    '    End',
    '  End',
    '  Draw = W3DScriptedModelDraw ModuleTag_Extra',
    '    DefaultModelConditionState',
    '      Model = TE_SKN',
    '    End',
    '  End',
    ...shadow,
    'End',
  ];

  return readObjectScene(parseSageIni(lines, schema), schema, () => false, () => false, lines)!;
};

const pick = (scene: ReturnType<typeof toScene>, draw = 'ModuleTag_Body', state?: number) =>
  pickDrawShadow(scene, draw, state === undefined ? undefined : scene.states[state]);

suite('Object shadows', () => {
  test('a volume is cast by every draw module, as high as the sun angle holds it', () => {
    const scene = toScene(['  Shadow = SHADOW_VOLUME_NON_SELF_3', '  ShadowSunAngle = 89']);

    assert.deepStrictEqual(pick(scene), { kind: 'cast', minSunAngle: 89 });
    assert.deepStrictEqual(pick(scene, 'ModuleTag_Extra'), { kind: 'cast', minSunAngle: 89 });
  });

  test("a decal lays the object's own texture under the body alone, its size a macro's", () => {
    const scene = toScene([
      '  Shadow = SHADOW_DECAL',
      '  ShadowTexture = TBlob',
      '  ShadowSizeX = TEST_WIDTH',
      '  ShadowSizeY = 30',
      '  ShadowOffsetX = -8',
    ]);

    resolveShadowMacros(scene.shadow!, (name) => (name === 'TEST_WIDTH' ? '44' : undefined));
    assert.deepStrictEqual(pick(scene), {
      kind: 'decal',
      blend: 'multiply',
      texture: 'TBlob',
      width: 44,
      depth: 30,
      offset: [-8, 0],
      opacity: 1,
      isCustom: true,
    });
    assert.strictEqual(pick(scene, 'ModuleTag_Extra'), undefined);
  });

  test("a state's decal stands in for the object's, and a dynamic one fades in", () => {
    const scene = toScene(
      ['  Shadow = SHADOW_VOLUME'],
      [
        '      Shadow = SHADOW_ADDITIVE_DECAL_DYNAMIC',
        '      ShadowTexture = TGlow',
        '      ShadowOpacityPeak = 51',
        '      ShadowOpacityFadeInTime = 1000',
      ],
    );
    const shadow = pick(scene, 'ModuleTag_Body', scene.states.findIndex((s) => /USER_1/.test(s.label)));

    assert.deepStrictEqual(shadow, {
      kind: 'decal',
      blend: 'additive',
      texture: 'TGlow',
      width: 0,
      depth: 0,
      offset: [0, 0],
      opacity: 0.2,
      isCustom: true,
      fadeIn: { from: 0, milliseconds: 1000 },
    });
    assert.deepStrictEqual(pick(scene), { kind: 'cast', minSunAngle: 0 });
  });

  test('none, a style without its texture and a disabled shadow draw nothing', () => {
    assert.strictEqual(pick(toScene(['  Shadow = NONE'])), undefined);
    assert.strictEqual(pick(toScene(['  Shadow = SHADOW_ALPHA_DECAL'])), undefined);
    assert.strictEqual(
      pick(toScene(['  Shadow = SHADOW_VOLUME', '  ShadowForceDisable = Yes'])),
      undefined,
    );
  });

  test('the stock blobs are the only decals that are not custom', () => {
    const isCustom = (style: string, texture?: string) => {
      const shadow = pick(
        toScene([
          `  Shadow = ${style}`,
          ...(texture ? [`  ShadowTexture = ${texture}`] : []),
        ]),
      );

      return shadow?.kind === 'decal' && shadow.isCustom;
    };

    assert.deepStrictEqual(
      [
        isCustom('SHADOW_DECAL'),
        isCustom('SHADOW_DECAL', 'ShadowI'),
        isCustom('SHADOW_DECAL', 'shadowi.tga'),
        isCustom('SHADOW_DECAL', 'ShadowIvy'),
        isCustom('SHADOW_ADDITIVE_DECAL', 'ShadowI'),
      ],
      [false, false, false, true, true],
    );
  });

  test('a size past any map is bounded', () => {
    const shadow = pick(toScene(['  Shadow = SHADOW_DECAL', '  ShadowSizeX = 99999999999']));

    assert.ok(shadow?.kind === 'decal' && shadow.width === 10_000);
  });

  test('a placed model is cut at the ground, not at its own origin', () => {
    const at = [1, 0, 0, 0,  0, 0, 1, 0,  0, -1, 0, 0,  7, 8, -5, 1];
    const [a, b, c, d] = getHeightPlane(at);
    const getHeight = (x: number, y: number, z: number) => a * x + b * y + c * z + d;

    assert.deepStrictEqual(
      [getHeight(0, 0, 0), getHeight(0, 5, 0), getHeight(3, 9, 40)],
      [-5, 0, 4],
    );
  });

  test("the sun is the time of day's, and shadows fall away from it", () => {
    const sun = readSunDirection(
      [
        'GameData',
        '  TimeOfDay = AFTERNOON',
        '  TerrainLightingMorningLightPos = X:1 Y:0 Z:-1',
        '  TerrainLightingAfternoonLightPos = X:-1 Y:0.5 Z:-0.5 ; low',
        'End',
      ].join('\n'),
    );

    assert.deepStrictEqual(sun, [-1, 0.5, -0.5]);
    assert.deepStrictEqual(readSunDirection(''), DEFAULT_SUN);

    const matrix = computeGroundProjection(sun);

    assert.deepStrictEqual([matrix[8] * 10, matrix[9] * 10, matrix[10] * 10], [-20, 10, 0]);
    assert.ok(Math.abs(computeGroundProjection(sun, 89)[8]) < 0.02);
  });
});
