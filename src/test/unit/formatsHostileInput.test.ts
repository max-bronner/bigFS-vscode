import * as assert from 'assert';
import { deflateSync, inflateSync } from 'zlib';
import { fromCodeUnits } from '../../core/windows1252';
import { parseCsf, writeCsf } from '../../formats/csf/csf';
import { getRunBounds } from '../../formats/apt/aptGeometry';
import { AptReader, parseFrames } from '../../formats/apt/aptMovie';
import { parseSageIni, forEachBlock } from '../../formats/ini/sageIniParser';
import type { SageBlock } from '../../formats/ini/sageIniParser';
import { createSageIniSchema } from '../../formats/ini/sageIniSchema';
import { readFileSync } from 'fs';
import { join } from 'path';
import { applyMapEdit } from '../../formats/map/mapEdit';
import { parseMap } from '../../formats/map/mapFile';
import { decompressRefPack } from '../../formats/refpack/refpack';
import { parseStringRecords } from '../../formats/str/sageStringRecords';
import { decodePng } from '../../formats/texture/textureEncode';
import { decodeTga } from '../../formats/texture/textureTools';
import { parseW3dAnimations } from '../../formats/w3d/w3dAnimation';
import { Vp6Movie, parseVp6 } from '../../formats/vp6/container';
import { skin } from '../../formats/w3d/w3dPose';
import type { Pose } from '../../formats/w3d/w3dPose';
import type { SceneMesh } from '../../formats/w3d/w3dScene';
import { buildMap } from './mapSynth';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;

  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  out.set(Buffer.from(type, 'latin1'), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));

  return out;
};

const buildPng = (width: number, height: number, raw: Uint8Array) => {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);

  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
};

const inflate = (data: Uint8Array, limit: number) =>
  inflateSync(data, { maxOutputLength: limit });

const w3dChunk = (type: number, payload: Uint8Array): Buffer => {
  const header = Buffer.alloc(8);

  header.writeUInt32LE(type, 0);
  header.writeUInt32LE(payload.length, 4);

  return Buffer.concat([header, payload]);
};

suite('Hostile input to the format parsers', () => {
  suite('string tables', () => {
    test('an unclosed quote over many lines reads as it always did', () => {
      const lines = ['LABEL', '"first line'];

      for (let line = 0; line < 2000; line++) {
        lines.push(`  more text ${line} `);
      }

      const [record] = parseStringRecords(lines.join('\n'));

      assert.strictEqual(record.isUnclosed, true);
      assert.ok(record.text?.startsWith('first line more text 0 more text 1'));
      assert.ok(record.text?.endsWith('more text 1999'));
    });

    test('a quote closing on a later line, and a backslash before a line break', () => {
      const source = ['A', '"one \\', '"two" ignored', 'END', 'B', '"x', 'y"', 'END'].join('\n');
      const [first, second] = parseStringRecords(source);

      assert.strictEqual(first.isUnclosed, false);
      assert.strictEqual(first.text, 'one');
      assert.strictEqual(second.isUnclosed, false);
      assert.strictEqual(second.text, 'x y');
      assert.strictEqual(
        source.slice(second.textSpan?.start, second.textSpan?.end),
        '"x\ny"',
      );
    });
  });

  suite('APT', () => {
    test('pointers that share one array cannot multiply into millions of records', () => {
      const frames = 2000;
      const itemCount = 1000;
      const bytes = new Uint8Array(frames * 8 + itemCount * 4);
      const view = new DataView(bytes.buffer);
      const items = frames * 8;

      for (let frame = 0; frame < frames; frame++) {
        view.setUint32(frame * 8, itemCount, true);
        view.setUint32(frame * 8 + 4, items, true);
      }

      assert.throws(
        () => parseFrames(new AptReader(bytes), frames, 0),
        /more records than it can hold/,
      );
    });

    test('records are counted against one budget for the whole reader', () => {
      const reader = new AptReader(new Uint8Array(64));

      assert.throws(() => reader.countRecords(1e7), /more records/);
      assert.doesNotThrow(() => new AptReader(new Uint8Array(64)).countRecords(10));
    });

    test('bounds over a very large number of triangles', () => {
      const triangles = Array.from({ length: 300000 }, (_, index) => index % 7);
      const bounds = getRunBounds([
        { triangles, lines: [] } as unknown as Parameters<typeof getRunBounds>[0][0],
      ]);

      assert.deepStrictEqual(bounds, [0, 0, 6, 6]);
    });
  });

  suite('W3D animation', () => {
    test('a header claiming a huge frame count over many chunks is refused', () => {
      const header = Buffer.alloc(44);

      header.writeUInt32LE(100000, 36);
      header.writeUInt32LE(30, 40);

      const children = [w3dChunk(0x201, header)];

      for (let index = 0; index < 300; index++) {
        children.push(w3dChunk(0x202, Buffer.alloc(0)));
      }

      const file = w3dChunk(0x200, Buffer.concat(children));

      assert.throws(() => parseW3dAnimations(file), /too large to sample/);
    });

    test('a small animation still parses', () => {
      const header = Buffer.alloc(44);

      header.writeUInt32LE(10, 36);
      header.writeUInt32LE(30, 40);

      const [animation] = parseW3dAnimations(
        w3dChunk(0x200, w3dChunk(0x201, header)),
      );

      assert.strictEqual(animation.frameCount, 10);
    });

    test('skinning twice in one pose and in a moved pose follows the bones', () => {
      const mesh = {
        positions: new Float32Array(3),
        local: {
          positions: new Float32Array([1, 0, 0]),
          bones: new Uint16Array([0, 0]),
          weights: new Float32Array([1, 0]),
        },
      } as SceneMesh;
      const at = (x: number): Pose => ({
        world: [{ t: [x, 0, 0], q: [0, 0, 0, 1] }],
        visible: [true],
        opacity: [1],
      });
      const pose = at(5);
      const out = new Float32Array(3);

      skin(mesh, pose, out);
      assert.deepStrictEqual(Array.from(out), [6, 0, 0]);
      skin(mesh, pose, out);
      assert.deepStrictEqual(Array.from(out), [6, 0, 0]);
      skin(mesh, at(9), out);
      assert.deepStrictEqual(Array.from(out), [10, 0, 0]);
    });
  });

  suite('INI', () => {
    const schema = createSageIniSchema(
      JSON.parse(
        readFileSync(
          join(__dirname, '..', '..', '..', 'assets', 'sageIniSchema.json'),
          'utf8',
        ),
      ),
    );

    test('thousands of nested inline definitions neither overflow the stack nor close real blocks', () => {
      const depth = 20000;
      const lines = ['Object Hero'];

      for (let index = 0; index < depth; index++) {
        lines.push('AddEmotion = OVERRIDE X');
      }

      for (let index = 0; index < depth; index++) {
        lines.push('End');
      }

      lines.push('  DisplayName = X', 'End');

      const { blocks, strayEnds } = parseSageIni(lines, schema);
      let deepest = 0;
      let count = 0;
      const visit = (block: SageBlock, level: number) => {
        count++;
        deepest = Math.max(deepest, level);
        block.children.forEach((child) => visit(child, level + 1));
      };

      blocks.forEach((block) => visit(block, 1));
      forEachBlock(blocks, () => undefined);

      assert.ok(deepest <= 64, `depth ${deepest}`);
      assert.ok(count > 1);
      assert.deepStrictEqual(strayEnds, []);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].isClosed, true);
    });
  });

  suite('textures', () => {
    test('a PNG of zero width or height is refused', () => {
      assert.throws(
        () => decodePng(buildPng(0, 100000, new Uint8Array(8)), inflate),
        /outside 1 to/,
      );
      assert.throws(
        () => decodePng(buildPng(5, 0, new Uint8Array(8)), inflate),
        /outside 1 to/,
      );
    });

    test('a PNG beyond the side limit, or short of its pixel data, is refused', () => {
      assert.throws(
        () => decodePng(buildPng(9000, 2, new Uint8Array(8)), inflate),
        /outside 1 to/,
      );
      assert.throws(
        () => decodePng(buildPng(4, 4, new Uint8Array(20)), inflate),
        /ends early/,
      );
    });

    test('a TGA claiming a full-size image without its pixels is refused up front', () => {
      const header = new Uint8Array(18);

      header[2] = 2;
      header[12] = 0xff;
      header[13] = 0x1f;
      header[14] = 0xff;
      header[15] = 0x1f;
      header[16] = 32;

      assert.throws(() => decodeTga(header), /runs past the end/);

      header[2] = 10;
      assert.throws(() => decodeTga(header), /runs past the end/);
    });

    test('a RefPack stream cannot declare more output than it could expand to', () => {
      const stream = Uint8Array.of(0x10, 0xfb, 0xff, 0xff, 0xff, 0xfc);

      assert.throws(() => decompressRefPack(stream), /more than its stream holds/);
    });
  });

  suite('VP6', () => {
    const header = (tag: string, width: number, height: number) => {
      const bytes = Buffer.alloc(32);

      bytes.write(tag, 0, 'latin1');
      bytes.writeUInt32LE(32, 4);
      bytes.writeUInt16LE(width, 12);
      bytes.writeUInt16LE(height, 14);

      return bytes;
    };

    test('a movie declaring no size, or a huge one, is refused before a picture is allocated', () => {
      assert.throws(() => new Vp6Movie(header('MVhd', 0, 10)), /outside 1 to/);
      assert.throws(() => new Vp6Movie(header('MVhd', 65535, 65535)), /outside 1 to/);
    });

    test('a movie without frames says so, and a stub alpha file is refused', () => {
      const movie = new Vp6Movie(header('MVhd', 16, 16));

      assert.throws(() => movie.decodeFrame(0), /has no frames/);
      assert.throws(() => parseVp6(Buffer.from('AVP6')), /too short/);
    });
  });

  suite('long strings', () => {
    test('code units beyond the argument limit become text', () => {
      const units = Uint16Array.from({ length: 500000 }, (_, at) => 65 + (at % 26));
      const text = fromCodeUnits(units);

      assert.strictEqual(text.length, 500000);
      assert.strictEqual(text.slice(0, 3), 'ABC');
      assert.strictEqual(text[499999], String.fromCharCode(65 + (499999 % 26)));
    });

    test('a CSF string of half a million characters round-trips', () => {
      const text = 'x'.repeat(500000);
      const file = {
        version: 3,
        reserved: 0,
        language: 0,
        labels: [{ name: 'L', strings: [{ text }] }],
      };

      assert.strictEqual(parseCsf(writeCsf(file)).labels[0].strings[0].text, text);
    });
  });

  suite('map edits', () => {
    test('an area of many points and many names are handled without argument spreads', () => {
      const map = parseMap(buildMap());
      const points = Array.from(
        { length: 200000 },
        (_, index) => [index, index] as [number, number],
      );
      const edited = applyMapEdit(map, { kind: 'areaAdd', name: 'Big', points });

      assert.strictEqual(edited.triggerAreas.at(-1)?.points.length, 200000);
      assert.throws(
        () =>
          applyMapEdit(map, {
            kind: 'areaAdd',
            name: 'Bad',
            points: [[0, 0], [1, Number.NaN], [2, 2]],
          }),
        /must be a number/,
      );
    });
  });
});
