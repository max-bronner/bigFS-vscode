import { AptImage } from './writer/aptImage';

const SIGNATURE = 0x09876543;
const APT_HEADER = 'Apt Data:7\x1a\0';
const CONST_HEADER = 'Apt constant file\x1a\0\0';
const DAT_HEADER = '; Created by AptToBigc.\r\n';

export interface NewAptMovie {
  width: number;
  height: number;
  exports: string[];
}

export interface NewAptFiles {
  apt: Uint8Array;
  constFile: Uint8Array;
  dat: Uint8Array;
}

const latin1 = (text: string) =>
  Uint8Array.from(text, (character) => character.charCodeAt(0));

const emptyFrame = (image: AptImage) => image.appendWords([0, 0]);

export const createAptMovie = (movie: NewAptMovie): NewAptFiles => {
  const names = new Set<string>();

  for (const name of movie.exports) {
    if (!/^[\x21-\xff]+$/.test(name) || names.has(name)) {
      throw new Error(`"${name}" is not a usable export name`);
    }
    names.add(name);
  }

  const image = new AptImage(latin1(APT_HEADER));
  const record = image.appendWords(new Array(15).fill(0));
  const characters = [record];

  for (let index = 0; index < movie.exports.length; index++) {
    characters.push(image.appendWords([5, SIGNATURE, 1, emptyFrame(image), 0]));
  }

  const exports = movie.exports.flatMap((name, index) => [
    image.appendString(name),
    index + 1,
  ]);

  [
    9,
    SIGNATURE,
    1,
    emptyFrame(image),
    0,
    characters.length,
    image.appendWords(characters),
    movie.width,
    movie.height,
    33,
    0,
    0,
    exports.length / 2,
    exports.length ? image.appendWords(exports) : 0,
    0,
  ].forEach((word, index) => image.setU32(record + index * 4, word));

  const constFile = new Uint8Array(0x20);
  const view = new DataView(constFile.buffer);

  constFile.set(latin1(CONST_HEADER));
  view.setUint32(0x14, record, true);
  view.setUint32(0x18, 0, true);
  view.setUint32(0x1c, 0x20, true);

  return {
    apt: image.bytes,
    constFile,
    dat: latin1(DAT_HEADER + DAT_HEADER),
  };
};
