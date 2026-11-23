import * as assert from 'assert';
import {
  ASSET_KINDS,
  fromFileTime,
  getAssetKindName,
  parseAssetCatalogue,
  toFileTime,
  writeAssetCatalogue,
} from '../../formats/asset/assetCatalogue';
import type { AssetCatalogue } from '../../formats/asset/assetCatalogue';
import { describeAssetPath, getAssetKey } from '../../formats/asset/assetPaths';
import { readW3dAssetEntries } from '../../formats/asset/readW3dAssetEntries';
import { applyAssetChanges } from '../../game/asset/applyAssetChanges';
import { groupSyncRows } from '../../webview/assetCatalogue/groupSyncRows';
import {
  compareAssetCatalogue,
  findCatalogueLayer,
  isRecordStale,
} from '../../game/asset/compareAssetCatalogue';

const chunk = (type: number, payload: Uint8Array, holdsChunks = false): Uint8Array => {
  const bytes = new Uint8Array(8 + payload.length);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, type, true);
  view.setUint32(4, (payload.length | (holdsChunks ? 0x80000000 : 0)) >>> 0, true);
  bytes.set(payload, 8);

  return bytes;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;

  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }

  return bytes;
};

const struct = (...fields: (number | [string, number])[]): Uint8Array =>
  concat(
    ...fields.map((field) => {
      if (typeof field === 'number') {
        const bytes = new Uint8Array(4);

        new DataView(bytes.buffer).setUint32(0, field, true);
        return bytes;
      }

      const bytes = new Uint8Array(field[1]);

      bytes.set(Array.from(field[0], (char) => char.charCodeAt(0)));
      return bytes;
    }),
  );

const text = (value: string) => Uint8Array.from([...value, '\0'].map((char) => char.charCodeAt(0)));

const mesh = (container: string, name: string, textures: string[]) =>
  chunk(
    0x000,
    concat(
      chunk(0x01f, struct(0, 0, [name, 16], [container, 16])),
      chunk(0x030, concat(...textures.map((texture) => chunk(0x031, chunk(0x032, text(texture)), true))), true),
    ),
    true,
  );

const hierarchy = (name: string) => chunk(0x100, chunk(0x101, struct(0, [name, 16], 0)), true);

const animation = (name: string, skeleton: string) =>
  chunk(0x200, chunk(0x201, struct(0, [name, 16], [skeleton, 16], 10, 30)), true);

const hlod = (name: string, skeleton: string, lods: string[][], aggregates: string[] = []) => {
  const array = (type: number, names: string[]) =>
    chunk(type, concat(chunk(0x703, struct(names.length, 0)), ...names.map((sub) => chunk(0x704, struct(0, [sub, 32])))), true);

  return chunk(
    0x700,
    concat(
      chunk(0x701, struct(0, lods.length, [name, 16], [skeleton, 16])),
      ...lods.map((names) => array(0x702, names)),
      ...(aggregates.length ? [array(0x705, aggregates)] : []),
    ),
    true,
  );
};

const model = (meshTexture = 'unit.tga') =>
  concat(
    hierarchy('UNIT_SKL'),
    animation('UNIT_IDLA', 'UNIT_SKL'),
    mesh('UNIT', 'BODY', [meshTexture]),
    mesh('', 'LOOSE', []),
    hlod('UNIT', 'UNIT_SKL', [['UNIT.BODY', 'UNIT.LOOSE'], ['UNIT.LOW']], ['FX_SMOKE']),
  );

const time = toFileTime(Date.UTC(2006, 9, 26));

const catalogue = (): AssetCatalogue => ({
  version: 0x102,
  records: [
    { name: 'apt_Button.tga', timestamp: time, entries: [{ name: 'apt_button.tga', kind: ASSET_KINDS.TEX, offset: 0, size: 0 }] },
    { name: 'gone.w3d', timestamp: time, entries: [{ name: 'H*GONE', kind: ASSET_KINDS.HIER, offset: 0, size: 40 }] },
    { name: 'shared.png', timestamp: time, entries: [{ name: 'shared.png', kind: ASSET_KINDS.TEX, offset: 0, size: 0 }] },
    { name: 'shared.tga', timestamp: time, entries: [{ name: 'shared.tga', kind: ASSET_KINDS.TEX, offset: 0, size: 0 }] },
    { name: 'unit.tga', timestamp: time, entries: [{ name: 'unit.tga', kind: ASSET_KINDS.TEX, offset: 0, size: 0 }] },
    { name: 'unit.w3d', timestamp: time, entries: readW3dAssetEntries(model()).entries },
  ],
  dependencies: [
    { file: 'gone.w3d', subAsset: 'H*GONE', references: ['unit.tga'] },
    { file: 'unit.w3d', subAsset: 'UNIT.BODY', references: ['unit.tga'] },
  ],
});

suite('Asset catalogue', () => {
  test('writes back the bytes it read, and keeps names, times and order', () => {
    const bytes = writeAssetCatalogue(catalogue());
    const read = parseAssetCatalogue(bytes);

    assert.deepStrictEqual(read, catalogue());
    assert.deepStrictEqual(writeAssetCatalogue(read), bytes);
    assert.deepStrictEqual(Array.from(bytes.subarray(0, 8)), [0x41, 0x4c, 0x41, 0x45, 2, 1, 0, 0]);
    assert.strictEqual(fromFileTime(read.records[0].timestamp), Date.UTC(2006, 9, 26));
  });

  test('stores a kind as a big-endian code read backwards in the file', () => {
    const bytes = writeAssetCatalogue(catalogue());
    const at = 16 + 1 + 14 + 8 + 2 + 1 + 14;

    assert.strictEqual(String.fromCharCode(...bytes.subarray(at, at + 4)), 'XET\0');
    assert.strictEqual(getAssetKindName(ASSET_KINDS.TEX), 'TEX');
    assert.strictEqual(getAssetKindName(1), '0x00000001');
  });

  test('refuses a count the bytes cannot hold, before allocating for it', () => {
    const bytes = writeAssetCatalogue({ version: 0x102, records: [], dependencies: [] });

    new DataView(bytes.buffer).setUint32(8, 0xffffffff, true);
    assert.throws(() => parseAssetCatalogue(bytes), /4294967295 records/);
  });

  test('refuses another magic, another version, a cut file and bytes after the tables', () => {
    const bytes = writeAssetCatalogue(catalogue());
    const otherVersion = bytes.slice();

    new DataView(otherVersion.buffer).setUint32(4, 0x103, true);
    assert.throws(() => parseAssetCatalogue(Uint8Array.from([1, 2, 3])), /Not an asset catalogue/);
    assert.throws(() => parseAssetCatalogue(otherVersion), /version 0x103/);
    assert.throws(() => parseAssetCatalogue(bytes.subarray(0, bytes.length - 3)), /runs past the end/);
    assert.throws(() => parseAssetCatalogue(concat(bytes, Uint8Array.of(0))), /1 bytes follow/);
  });

  test('refuses to write a name a length byte cannot carry', () => {
    const tooLong = catalogue();

    tooLong.records[0].name = `${'a'.repeat(256)}.tga`;
    assert.throws(() => writeAssetCatalogue(tooLong), /1 to 255/);
  });
});

suite('Asset paths', () => {
  test('finds a record file where the engine looks for it, and nowhere else', () => {
    assert.deepStrictEqual(describeAssetPath('art/w3d/un/Unit.w3d'), { key: 'model:unit', kind: 'model', name: 'Unit.w3d', rank: 0 });
    assert.strictEqual(describeAssetPath('data/editor/molds/ramp.w3d')?.rank, 1);
    assert.strictEqual(describeAssetPath('art/w3d/xx/unit.w3d'), undefined);
    assert.deepStrictEqual(describeAssetPath('art/compiledtextures/un/unit.dds'), { key: 'texture:unit', kind: 'texture', name: 'unit.tga', rank: 0 });
    assert.strictEqual(describeAssetPath('art/textures/apt_button.tga')?.key, 'texture:apt_button');
    assert.strictEqual(describeAssetPath('art/textures/button.tga'), undefined);
    assert.strictEqual(describeAssetPath('art/compiledtextures/ap/apt_button.dds'), undefined);
    assert.deepStrictEqual(describeAssetPath('shaders/compiled/water.fxo'), { key: 'shader:water', kind: 'shader', name: 'water.fx', rank: 0 });
  });

  test('matches a texture record by stem, whatever source extension it kept', () => {
    assert.strictEqual(getAssetKey('Shared.PNG'), 'texture:shared');
    assert.strictEqual(getAssetKey('shared.tga'), describeAssetPath('art/compiledtextures/sh/shared.jpg')?.key);
    assert.strictEqual(getAssetKey('art/w3d/un/unit.w3d'), undefined);
  });
});

suite('W3D asset entries', () => {
  test('one entry per top-level chunk, covering its header, named as the catalogue names it', () => {
    const bytes = model();
    const { entries } = readW3dAssetEntries(bytes);

    assert.deepStrictEqual(
      entries.map((entry) => `${getAssetKindName(entry.kind)} ${entry.name}`),
      ['HIER H*UNIT_SKL', 'ANIM A*UNIT_SKL.UNIT_IDLA', 'MESH UNIT.BODY', 'MESH LOOSE', 'HLOD UNIT'],
    );
    assert.strictEqual(entries[0].offset, 0);
    assert.strictEqual(entries[1].offset, entries[0].size);
    assert.strictEqual(entries.at(-1)!.offset + entries.at(-1)!.size, bytes.length);
  });

  test('an HLOD refers to its first LOD, its aggregates and its skeleton; a mesh to its textures', () => {
    assert.deepStrictEqual(readW3dAssetEntries(model()).references, [
      { subAsset: 'UNIT.BODY', names: ['unit.tga'] },
      { subAsset: 'UNIT', names: ['unit.body', 'unit.loose', 'fx_smoke', 'h*unit_skl'] },
    ]);
  });

  test('stops at a chunk that runs past the bytes, as the catalogue does for trailing junk', () => {
    const bytes = concat(hierarchy('A'), Uint8Array.from([0, 0, 0, 0, 0xff, 0xff, 0, 0]));

    assert.strictEqual(readW3dAssetEntries(bytes).entries.length, 1);
    assert.deepStrictEqual(readW3dAssetEntries(new Uint8Array(0)).entries, []);
  });
});

suite('Asset catalogue sync', () => {
  const files = [
    { entryPath: 'art/w3d/un/unit.w3d', ref: model('other.tga'), isOwned: true },
    { entryPath: 'art/w3d/ne/new.w3d', ref: concat(hierarchy('NEW')), isOwned: true },
    { entryPath: 'art/w3d/ba/base.w3d', ref: concat(hierarchy('BASE')), isOwned: false },
    { entryPath: 'art/compiledtextures/un/unit.dds', ref: new Uint8Array(0), isOwned: true },
    { entryPath: 'art/compiledtextures/sh/shared.jpg', ref: new Uint8Array(0), isOwned: true },
    { entryPath: 'art/compiledtextures/sh/shared.png', ref: new Uint8Array(0), isOwned: true },
    { entryPath: 'art/textures/apt_button.dds', ref: new Uint8Array(0), isOwned: true },
    { entryPath: 'art/compiledtextures/fr/fresh.dds', ref: new Uint8Array(0), isOwned: true },
  ];

  test('finds the files no record stands for, only in the layers the catalogue answers for', () => {
    const { missing } = compareAssetCatalogue(catalogue().records, files);

    assert.deepStrictEqual(missing.map((file) => file.name), ['new.w3d', 'fresh.tga']);
  });

  test('finds the records no file answers', () => {
    const { gone } = compareAssetCatalogue(catalogue().records, files);

    assert.deepStrictEqual(gone.map((record) => record.name), ['gone.w3d']);
  });

  test('a model is stale when its chunks moved, and not when it is unchanged', () => {
    const { toCheck } = compareAssetCatalogue(catalogue().records, files);
    const [unit] = toCheck;

    assert.deepStrictEqual(toCheck.map((check) => check.record.name), ['unit.w3d']);
    assert.strictEqual(isRecordStale(unit.record, readW3dAssetEntries(model())), false);
    assert.strictEqual(isRecordStale(unit.record, readW3dAssetEntries(unit.file.ref)), true);
  });

  test('a layer without a catalogue is answered for by the nearest one beneath it', () => {
    assert.strictEqual(findCatalogueLayer([false, true, true], 0), 1);
    assert.strictEqual(findCatalogueLayer([false, true, true], 2), 2);
    assert.strictEqual(findCatalogueLayer([true, false], 1), undefined);
  });

  test('applying adds, replaces and drops records in order, with references the catalogue holds', () => {
    const { missing, gone, toCheck } = compareAssetCatalogue(catalogue().records, files);
    const synced = applyAssetChanges(catalogue(), {
      put: [
        ...missing.map((file) => ({
          name: file.name,
          kind: file.kind,
          timestamp: time,
          contents: file.kind === 'model' ? readW3dAssetEntries(file.ref) : undefined,
        })),
        { name: 'unit.w3d', kind: 'model' as const, timestamp: time, contents: readW3dAssetEntries(toCheck[0].file.ref) },
      ],
      remove: gone.map((record) => record.name),
    });

    assert.deepStrictEqual(
      synced.records.map((record) => record.name),
      ['apt_Button.tga', 'fresh.tga', 'new.w3d', 'shared.png', 'shared.tga', 'unit.tga', 'unit.w3d'],
    );
    assert.deepStrictEqual(synced.records[1].entries, [{ name: 'fresh.tga', kind: ASSET_KINDS.TEX, offset: 0, size: 0 }]);
    assert.deepStrictEqual(synced.dependencies, [
      { file: 'unit.w3d', subAsset: 'UNIT', references: ['h*unit_skl', 'unit.body'] },
    ]);
    assert.deepStrictEqual(compareAssetCatalogue(synced.records, files).missing, []);
    assert.deepStrictEqual(parseAssetCatalogue(writeAssetCatalogue(synced)), synced);
  });

  test('applying nothing writes the catalogue unchanged', () => {
    assert.deepStrictEqual(
      writeAssetCatalogue(applyAssetChanges(catalogue(), { put: [], remove: [] })),
      writeAssetCatalogue(catalogue()),
    );
  });
});

suite('Asset sync panel', () => {
  test('rows are grouped by the archive their file comes from, in the order each first appears', () => {
    const groups = groupSyncRows([
      { id: 'a', name: 'a.w3d', origin: 'W3D.big' },
      { id: 'b', name: 'b.tga', origin: 'Textures.big' },
      { id: 'c', name: 'c.w3d', origin: 'W3D.big' },
      { id: 'd', name: 'd.w3d' },
    ]);

    assert.deepStrictEqual(
      groups.map(({ origin, rows }) => [origin, rows.map((row) => row.id)]),
      [
        ['W3D.big', ['a', 'c']],
        ['Textures.big', ['b']],
        ['', ['d']],
      ],
    );
  });
});
