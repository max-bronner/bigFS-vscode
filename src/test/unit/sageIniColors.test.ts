import * as assert from 'assert';
import {
  findColorValue,
  formatColorValue,
  parseColorValue,
} from '../../formats/ini/sageIniColors';
import type { SageColor } from '../../formats/ini/sageIniColors';
import { parseSageIni, tokenize } from '../../formats/ini/sageIniParser';
import { loadSageIniSchema } from './loadSageIniSchema';

const readChannels = (value: string): number[] | undefined => {
  const color = parseColorValue(tokenize(value))?.color;

  return color && [color.red, color.green, color.blue, color.alpha].map((c) => +(c * 255).toFixed(2));
};

const pick = (value: string, [red, green, blue, alpha]: number[]): string => {
  const parsed = parseColorValue(tokenize(value))!;
  const color: SageColor = { red: red / 255, green: green / 255, blue: blue / 255, alpha: alpha / 255 };
  const { start, end, text } = formatColorValue(value, parsed, color);

  return value.slice(0, start) + text + value.slice(end);
};

suite('SAGE INI colours', () => {
  test('reads each notation the data writes, alpha 255 when absent', () => {
    assert.deepStrictEqual(readChannels('R:40 G:60 B:200'), [40, 60, 200, 255]);
    assert.deepStrictEqual(readChannels('R:40 G:60 B:200 A:128'), [40, 60, 200, 128]);
    assert.deepStrictEqual(readChannels('R:40 G:60 B:200 12'), [40, 60, 200, 255]);
    assert.deepStrictEqual(readChannels('b:200 r: 40 G:60'), [40, 60, 200, 255]);
    assert.deepStrictEqual(readChannels('R:127.5 G:0.0 B:255.0'), [127.5, 0, 255, 255]);
    assert.strictEqual(readChannels('R:40 G:60'), undefined);
    assert.strictEqual(readChannels('35'), undefined);
  });

  test('writes a picked colour back in the line\'s own notation', () => {
    assert.strictEqual(pick('R:40 G:60 B:200', [1, 2, 3, 128]), 'R:1 G:2 B:3');
    assert.strictEqual(pick('R:40 G:60 B:200 A:255', [1, 2, 3, 128]), 'R:1 G:2 B:3 A:128');
    assert.strictEqual(pick('R:40 G:60 B:200 12', [1, 2, 3, 255]), 'R:1 G:2 B:3 12');
    assert.strictEqual(pick('b:200  r: 40 G:60', [1, 2, 3, 255]), 'b:3  r: 1 G:2');
    assert.strictEqual(pick('R:1.0 G:0.00 B:255', [127.5, 63.75, 3, 255]), 'R:127.5 G:63.75 B:3');
  });

  test('clamps channels to 0 to 255 when reading and writing', () => {
    assert.deepStrictEqual(readChannels('R:300 G:128 B:-128'), [255, 128, 0, 255]);
    assert.strictEqual(pick('R:0 G:0 B:0', [400, -20, 255, 255]), 'R:255 G:0 B:255');
  });

  test('a value is a colour only where the schema types its field as one', () => {
    const schema = loadSageIniSchema();
    const { statements } = parseSageIni(
      ['Weather', '  HardwareFogColor = R:10 G:20 B:30', '  SnowXYSpeed = R:10 G:20 B:30', 'End'],
      schema,
    );
    const colors = statements.map((statement) => !!findColorValue(statement, schema));

    assert.deepStrictEqual(colors, [false, true, false]);
  });
});
