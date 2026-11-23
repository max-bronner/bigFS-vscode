import { CHARACTER_SIGNATURE } from '../../formats/apt/aptMovie';
import { Image, buildConst } from './aptSynth';

const SIGNATURE = 0x09876543;

export const buildMovie = () => {
  const apt = new Image();

  apt.writeU8(...Array.from('Apt Data:7\x1a\0', (c) => c.charCodeAt(0)));
  apt.align();

  const shape = apt.writeU32(1, SIGNATURE);
  apt.writeF32(0, 0, 10, 10);
  apt.writeU32(1);

  const image = apt.writeU32(7, SIGNATURE, 2);

  const place = apt.writeU32(3, 0x02 | 0x04, 1, 1);
  apt.writeF32(1, 0, 0, 1, 5, 6);
  apt.writeU32(0xffffffff, 0);
  apt.writeF32(0);
  apt.writeU32(0, 0, 0);
  const spriteItems = apt.writeU32(place);
  const spriteFrames = apt.writeU32(1, spriteItems);
  const sprite = apt.writeU32(5, SIGNATURE, 1, spriteFrames, 0);

  const text = apt.writeString('Hello');
  const variable = apt.writeString('_parent.label');
  const editText = apt.writeU32(2, SIGNATURE);
  apt.writeF32(0, 0, 100, 20);
  apt.writeU32(0, 1, 0xffffcc00);
  apt.writeF32(12);
  apt.writeU32(1, 0, 0, text, variable);

  apt.align();
  const poolList = apt.writeU32(0, 1);
  const go = apt.writeString('go');
  const block = apt.writeU8(0x88);
  apt.align();
  apt.writeU32(2, poolList);
  const pushAt = apt.writeU8(0xa1);
  apt.align();
  apt.writeU32(go);
  apt.writeU8(0x99);
  apt.align();
  apt.writeU32(1);
  apt.writeU8(0x07, 0x00);

  apt.align();
  const label = apt.writeString('_start');
  apt.align();
  const rootPlace = apt.writeU32(3, 0x02, 2, 3);
  apt.writeU32(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  const rootLabel = apt.writeU32(2, label, 0, 0);
  const rootAction = apt.writeU32(1, block);
  const rootItems = apt.writeU32(rootPlace, rootLabel, rootAction);
  const rootFrames = apt.writeU32(3, rootItems);

  const exportName = apt.writeString('Label');
  apt.align();
  const exports = apt.writeU32(exportName, 4);
  const characters = apt.writeU32(0, shape, image, sprite, editText);

  const movie = apt.writeU32(9, SIGNATURE, 1, rootFrames, 0, 5, characters);
  apt.writeU32(1024, 768, 33, 0, 0, 1, exports, 0);
  apt.patch(characters, movie);

  return {
    apt: apt.build(),
    constFile: buildConst(movie, ['this', 'stop', 7]),
    block,
    pushAt,
  };
};

export const buildFullMovie = () => {
  const apt = new Image();

  apt.writeU8(...Array.from('Apt Data:7\x1a\0', (c) => c.charCodeAt(0)));
  apt.align();

  const block = apt.writeU8(0x00);
  apt.align();

  const shape = apt.writeU32(1, CHARACTER_SIGNATURE);
  apt.writeF32(0, 0, 10, 10);
  apt.writeU32(1);

  const fontName = apt.writeString('Arial');
  apt.align();
  const glyphTable = apt.writeU32(65, 66);
  const font = apt.writeU32(3, CHARACTER_SIGNATURE, fontName, 2, glyphTable);

  const vertices = apt.writeF32(0, 0, 10, 0, 0, 10);
  const triangles = apt.writeU32(0 | (1 << 16), 2);
  const buttonRecords = apt.writeU32(1 | 2 | 4, 1, 1);
  apt.writeF32(1, 0, 0, 1, 2, 3, 0.5, 0.25, 1, 1, 0, 0, 0, 0);
  const buttonActions = apt.writeU32(0x8, block);
  const button = apt.writeU32(4, CHARACTER_SIGNATURE, 0);
  apt.writeF32(0, 0, 10, 10);
  apt.writeU32(1, 3, vertices, triangles, 1, buttonRecords, 1, buttonActions);

  const placeName = apt.writeString('clip');
  apt.align();
  const clipArray = apt.writeU32(1 << 1, 0, block);
  const clipList = apt.writeU32(1, clipArray);
  const place = apt.writeU32(3, 0xff, 2, 1);
  apt.writeF32(1, 0, 0, 1, 5, 6);
  apt.writeU32(0x80ff8040, 0x00102030);
  apt.writeF32(0.5);
  apt.writeU32(placeName, 4, clipList);
  const remove = apt.writeU32(4, 7);
  const spriteItems = apt.writeU32(place, remove);
  const spriteFrames = apt.writeU32(2, spriteItems);
  const sprite = apt.writeU32(5, CHARACTER_SIGNATURE, 1, spriteFrames, 0);

  const image = apt.writeU32(7, CHARACTER_SIGNATURE, 5);
  const morph = apt.writeU32(8, CHARACTER_SIGNATURE, 1, 1);

  const glyphs = apt.writeU32(3, 7, 4, 0xfffffffe);
  const textRuns = apt.writeU32(2);
  apt.writeF32(0.25, 0.5, 1, 0.75, 0, 0, 0, 0, 1, 2, 12);
  apt.writeU32(2, glyphs);
  const text = apt.writeU32(10, CHARACTER_SIGNATURE);
  apt.writeF32(0, 0, 50, 20, 1, 0, 0, 1, 4, 8);
  apt.writeU32(1, textRuns);

  const textValue = apt.writeString('Hello');
  apt.align();
  const editText = apt.writeU32(2, CHARACTER_SIGNATURE);
  apt.writeF32(0, 0, 100, 20);
  apt.writeU32(2, 1, 0xffffcc00);
  apt.writeF32(12);
  apt.writeU32(1, 0, 0, textValue, 0);

  const label = apt.writeString('_start');
  apt.align();
  const rootLabel = apt.writeU32(2, label, 0, 0);
  const rootBackground = apt.writeU32(5, 0xff102030);
  const rootInit = apt.writeU32(8, 4, block);
  const rootAction = apt.writeU32(1, block);
  const rootItems = apt.writeU32(rootLabel, rootBackground, rootInit, rootAction);
  const rootFrames = apt.writeU32(4, rootItems);

  const importMovie = apt.writeString('shared');
  const importName = apt.writeString('Thing');
  const exportName = apt.writeString('Label');
  apt.align();
  const imports = apt.writeU32(importMovie, importName, 9, 0);
  const exports = apt.writeU32(exportName, 8);
  const characters = apt.writeU32(
    0,
    shape,
    font,
    button,
    sprite,
    image,
    morph,
    text,
    editText,
    0,
  );
  const movie = apt.writeU32(
    9,
    CHARACTER_SIGNATURE,
    1,
    rootFrames,
    0,
    10,
    characters,
  );
  apt.writeU32(1024, 768, 33, 1, imports, 1, exports, 0);
  apt.patch(characters, movie);

  return {
    apt: apt.build(),
    constFile: buildConst(movie, ['this', 'stop', 7]),
    offsets: { place, remove, rootLabel, rootBackground, rootInit },
  };
};
