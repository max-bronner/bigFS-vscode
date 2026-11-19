export interface AssetEntry {
  name: string;
  kind: number;
  offset: number;
  size: number;
}

export interface FileTime {
  low: number;
  high: number;
}

export interface AssetRecord {
  name: string;
  timestamp: FileTime;
  entries: AssetEntry[];
}

export interface AssetDependency {
  file: string;
  subAsset: string;
  references: string[];
}

export interface AssetCatalogue {
  version: number;
  records: AssetRecord[];
  dependencies: AssetDependency[];
}

export const ASSET_KINDS = {
  MESH: 0x4d455348,
  ANIM: 0x414e494d,
  HLOD: 0x484c4f44,
  TEX: 0x00544558,
  HIER: 0x48494552,
  BOX: 0x00424f58,
  FXSH: 0x46585348,
  PART: 0x50415254,
} as const;

export const ASSET_CATALOGUE_NAME = 'asset.dat';

export const ASSET_CATALOGUE_VERSION = 0x102;

const MAGIC = 'ALAE';
const HEADER_LENGTH = 16;
const MIN_RECORD_LENGTH = 11;
const MIN_ENTRY_LENGTH = 13;
const MIN_DEPENDENCY_LENGTH = 4;
const MIN_REFERENCE_LENGTH = 1;
const MAX_NAME_LENGTH = 255;
const MAX_LIST_LENGTH = 0xffff;

export const getAssetKindName = (kind: number): string => {
  const bytes = [kind >>> 24, (kind >>> 16) & 255, (kind >>> 8) & 255, kind & 255];

  return bytes.every((byte) => byte === 0 || (byte > 0x20 && byte < 0x7f))
    ? String.fromCharCode(...bytes.filter(Boolean))
    : `0x${(kind >>> 0).toString(16).padStart(8, '0')}`;
};

export const compareAssetNames = (a: string, b: string): number => {
  const left = a.toLowerCase();
  const right = b.toLowerCase();

  return left < right ? -1 : left > right ? 1 : 0;
};

export const toFileTime = (milliseconds: number): FileTime => {
  const ticks =
    (BigInt(Math.floor(milliseconds / 1000)) + 11644473600n) * 10000000n;

  return { low: Number(ticks & 0xffffffffn), high: Number(ticks >> 32n) };
};

export const fromFileTime = ({ low, high }: FileTime): number =>
  Number(((BigInt(high) << 32n) | BigInt(low)) / 10000n) - 11644473600000;

export const parseAssetCatalogue = (bytes: Uint8Array): AssetCatalogue => {
  if (
    bytes.length < HEADER_LENGTH ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== MAGIC
  ) {
    throw new Error('Not an asset catalogue: asset.dat starts with "ALAE"');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);

  if (version !== ASSET_CATALOGUE_VERSION) {
    throw new Error(
      `Asset catalogue version 0x${version.toString(16)} is not the 0x102 both games ship`,
    );
  }

  let at = HEADER_LENGTH;
  const need = (length: number, what: string) => {
    if (length > bytes.length - at) {
      throw new Error(`The ${what} at byte ${at} runs past the end of the file`);
    }
  };
  const u16 = (what: string) => {
    need(2, what);
    at += 2;

    return view.getUint16(at - 2, true);
  };
  const u32 = (what: string) => {
    need(4, what);
    at += 4;

    return view.getUint32(at - 4, true);
  };
  const name = (what: string) => {
    need(1, what);

    const length = bytes[at];

    if (!length) {
      throw new Error(`The ${what} at byte ${at} is empty`);
    }

    need(1 + length, what);
    at += 1 + length;

    return String.fromCharCode(...bytes.subarray(at - length, at));
  };
  const checkCount = (count: number, minLength: number, what: string) => {
    if (count * minLength > bytes.length - at) {
      throw new Error(
        `${count} ${what} claimed before byte ${at} need more bytes than the file has left`,
      );
    }
  };

  const recordCount = view.getUint32(8, true);
  const dependencyCount = view.getUint32(12, true);
  const records: AssetRecord[] = [];

  checkCount(recordCount, MIN_RECORD_LENGTH, 'records');

  for (let index = 0; index < recordCount; index++) {
    const recordName = name("record's name");
    const low = u32('timestamp');
    const high = u32('timestamp');
    const entryCount = u16('entry count');
    const entries: AssetEntry[] = [];

    checkCount(entryCount, MIN_ENTRY_LENGTH, `entries of ${recordName}`);

    for (let entry = 0; entry < entryCount; entry++) {
      entries.push({
        name: name("entry's name"),
        kind: u32('kind'),
        offset: u32('offset'),
        size: u32('size'),
      });
    }

    records.push({ name: recordName, timestamp: { low, high }, entries });
  }

  const dependencies: AssetDependency[] = [];

  checkCount(dependencyCount, MIN_DEPENDENCY_LENGTH, 'dependencies');

  for (let index = 0; index < dependencyCount; index++) {
    const file = name("dependency's file");
    const subAsset = name("dependency's sub-asset");
    const count = u16('reference count');
    const references: string[] = [];

    checkCount(count, MIN_REFERENCE_LENGTH, `references of ${file}`);

    for (let reference = 0; reference < count; reference++) {
      references.push(name('reference'));
    }

    dependencies.push({ file, subAsset, references });
  }

  if (at !== bytes.length) {
    throw new Error(
      `${bytes.length - at} bytes follow the tables, which a catalogue never has`,
    );
  }

  return { version, records, dependencies };
};

export const writeAssetCatalogue = (catalogue: AssetCatalogue): Uint8Array => {
  const nameLength = (text: string) => {
    const isLatin1 = Array.from(text).every((char) => {
      const code = char.charCodeAt(0);

      return code > 0 && code < 256;
    });

    if (!text.length || text.length > MAX_NAME_LENGTH || !isLatin1) {
      throw new Error(
        `"${text}" cannot be stored: a catalogue name is 1 to 255 Latin-1 characters`,
      );
    }

    return 1 + text.length;
  };
  const listLength = (count: number, owner: string) => {
    if (count > MAX_LIST_LENGTH) {
      throw new Error(`${owner} has ${count} items; a catalogue stores at most 65535`);
    }

    return 2;
  };
  let size = HEADER_LENGTH;

  for (const record of catalogue.records) {
    size += nameLength(record.name) + 8 + listLength(record.entries.length, record.name);

    for (const entry of record.entries) {
      size += nameLength(entry.name) + 12;
    }
  }

  for (const dependency of catalogue.dependencies) {
    size +=
      nameLength(dependency.file) +
      nameLength(dependency.subAsset) +
      listLength(dependency.references.length, dependency.subAsset);

    for (const reference of dependency.references) {
      size += nameLength(reference);
    }
  }

  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let at = 0;
  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(at, value >>> 0, true);
    at += 4;
  };
  const name = (text: string) => {
    bytes[at++] = text.length;

    for (let index = 0; index < text.length; index++) {
      bytes[at++] = text.charCodeAt(index);
    }
  };

  bytes.set([0x41, 0x4c, 0x41, 0x45]);
  at = 4;
  u32(catalogue.version);
  u32(catalogue.records.length);
  u32(catalogue.dependencies.length);

  for (const record of catalogue.records) {
    name(record.name);
    u32(record.timestamp.low);
    u32(record.timestamp.high);
    u16(record.entries.length);

    for (const entry of record.entries) {
      name(entry.name);
      u32(entry.kind);
      u32(entry.offset);
      u32(entry.size);
    }
  }

  for (const dependency of catalogue.dependencies) {
    name(dependency.file);
    name(dependency.subAsset);
    u16(dependency.references.length);
    dependency.references.forEach(name);
  }

  return bytes;
};
