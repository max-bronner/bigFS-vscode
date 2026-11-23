import * as assert from 'assert';
import {
  parseAptMovie,
  parseConst,
  parseSpriteFrames,
} from '../../formats/apt/aptMovie';
import { decodeBlock, printListing } from '../../formats/apt/aptBytecode';
import { parseDat, parseRu } from '../../formats/apt/aptGeometry';
import { buildMovie } from './aptMovieFixtures';

suite('APT movies', () => {
  test('the .const gives the movie offset and its items', () => {
    const { constFile } = buildMovie();
    const parsed = parseConst(constFile);

    assert.deepStrictEqual(
      parsed.items.map((item) => item.value),
      ['this', 'stop', 7],
    );
  });

  test('reads every character type, the exports and the timeline', () => {
    const { apt, constFile } = buildMovie();
    const movie = parseAptMovie(apt, parseConst(constFile).movieOffset);

    assert.deepStrictEqual(
      movie.characters.map((character) => character.type),
      ['movie', 'shape', 'image', 'sprite', 'editText'],
    );
    assert.deepStrictEqual(movie.exports, [{ name: 'Label', character: 4 }]);
    assert.deepStrictEqual(
      movie.frames[0].items.map((item) => item.type),
      ['placeObject', 'frameLabel', 'action'],
    );

    const edit = movie.characters[4];

    assert.ok(edit.type === 'editText');
    assert.strictEqual(edit.text, 'Hello');
    assert.strictEqual(edit.variable, '_parent.label');

    const sprite = movie.characters[3];

    assert.ok(sprite.type === 'sprite');

    const [placement] = parseSpriteFrames(apt, sprite)[0].items;

    assert.ok(placement.type === 'placeObject');
    assert.strictEqual(placement.character, 1);
    assert.deepStrictEqual(placement.translate, [5, 6]);
  });

  test('a character table that claims more than the file holds is refused', () => {
    const { apt, constFile } = buildMovie();
    const movieOffset = parseConst(constFile).movieOffset;

    new DataView(apt.buffer).setUint32(movieOffset + 20, 0x10000000, true);

    assert.throws(() => parseAptMovie(apt, movieOffset), /cannot fit/);
  });

  test('decodes a block with its aligned operands and branch targets', () => {
    const { apt, block } = buildMovie();
    const code = decodeBlock(apt, block);

    assert.deepStrictEqual(
      code.map((instruction) => instruction.name),
      ['ConstantPool', 'EA_PushString', 'BranchAlways', 'Stop', 'End'],
    );
    assert.strictEqual(code[1].operand, 'go');
    assert.strictEqual(code[2].target, code[4].offset);

    const listing = printListing(code, [
      { kind: 'string', value: 'this' },
      { kind: 'string', value: 'stop' },
    ]);

    assert.match(listing, /ConstantPool \["this", "stop"\]/);
    assert.match(listing, /BranchAlways L[0-9a-f]+/);
  });

  test('reads .ru styles with the texture matrix as the data stores it', () => {
    const runs = parseRu(
      [
        'c',
        's s:255:0:0:255',
        't 0:0:10:0:0:10',
        's tc:255:255:255:255:2:0.5:0:0:0.5:1:2',
        't 0:0:4:0:0:4',
        's l:1:0:0:0:255',
        'l 0:0:10:10',
      ].join('\n'),
    );

    assert.deepStrictEqual(
      runs.map((run) => [
        run.style.kind,
        run.triangles.length,
        run.lines.length,
      ]),
      [
        ['solid', 6, 0],
        ['texture', 6, 0],
        ['line', 0, 4],
      ],
    );
    assert.deepStrictEqual(
      runs[1].style.kind === 'texture' && runs[1].style.transform,
      [0.5, 0, 0, 0.5, 1, 2],
    );
    assert.throws(() => parseRu('s s:1:2:3:4\nq 1:2'), /line 2/);
  });

  test('reads both .dat line forms', () => {
    const entries = parseDat(
      [
        '; Created by AptToBigc.',
        '3=0 0 112 5',
        '; Created by AptToBigc.',
        '4->1',
      ].join('\n'),
    );

    assert.deepStrictEqual(entries.get(3), {
      kind: 'standalone',
      rect: [0, 0, 112, 5],
    });
    assert.deepStrictEqual(entries.get(4), { kind: 'atlas', page: 1 });
  });

  test('a truncated constant file fails with a message', () => {
    const magic = Uint8Array.from('Apt constant file\x1a\0\0', (char) =>
      char.charCodeAt(0),
    );

    assert.throws(
      () => parseConst(magic),
      /Read of 4 bytes at 20 is outside the 20 byte file/,
    );
  });
});
