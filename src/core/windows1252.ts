const HIGH_CONTROLS =
  '\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f' +
  '\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178';

const UPPER_HALF = new Map(
  Array.from({ length: 128 }, (_, index) => [
    index < 32 ? HIGH_CONTROLS[index] : String.fromCharCode(index + 128),
    index + 128,
  ]),
);

const CHUNK = 0x8000;

export const decodeWindows1252 = (bytes: Uint8Array): string => {
  let text = '';

  for (let at = 0; at < bytes.length; at += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return text.replace(
    /[\x80-\x9f]/g,
    (char) => HIGH_CONTROLS[char.charCodeAt(0) - 0x80],
  );
};

export const decodeIniText = (bytes: Uint8Array): string =>
  decodeWindows1252(
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes,
  );

export const encodeWindows1252 = (
  text: string,
  replacement?: number,
): Uint8Array =>
  Uint8Array.from(Array.from(text), (char) => {
    const code = char.charCodeAt(0);
    const byte = code < 128 ? code : UPPER_HALF.get(char);

    if (byte !== undefined) {
      return byte;
    }

    if (replacement === undefined) {
      throw new Error(
        `${JSON.stringify(char)} cannot be written in Windows-1252`,
      );
    }

    return replacement;
  });

export const unencodableCharacters = (text: string): string[] => [
  ...new Set(
    Array.from(text).filter(
      (char) => char.charCodeAt(0) >= 128 && !UPPER_HALF.has(char),
    ),
  ),
];
