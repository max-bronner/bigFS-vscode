import { isContainedPath } from '../../core/paths';

export interface BigFileEntry {
  name: string;
  storedName?: string;
  offset: number;
  size: number;
  pendingData?: Uint8Array;
  pendingFile?: string;
}

export interface ParsedArchive {
  magic: string;
  trailer: Uint8Array;
  entries: BigFileEntry[];
}

export interface PlacedEntry {
  entry: BigFileEntry;
  offset: number;
  size: number;
}

export interface ArchiveLayout {
  placedEntries: PlacedEntry[];
  indexTableEndOffset: number;
  trailer: Uint8Array;
  dataOffset: number;
  totalSize: number;
}

export const HEADER_LENGTH = 16;

const MAGICS = new Set(['BIGF', 'BIG4']);

export class NotAnArchiveError extends Error {}

const alignBytes = (offset: number): number => {
  return (offset + 3) & ~3;
};

const NAME_ENCODING = 'latin1';

const toTreeName = (name: string): string => name.replace(/\\/g, '/');

const getStoredName = (entry: BigFileEntry): string => {
  if (entry.storedName !== undefined) {
    return entry.storedName;
  }

  if (/[^\u0000-\u00ff]/.test(entry.name)) {
    throw new Error(
      `Entry name cannot be stored in a BIG archive: ${entry.name}`,
    );
  }

  return entry.name.replace(/\//g, '\\');
};

export const parseHeader = (buffer: Buffer) => {
  const magic = buffer.toString('ascii', 0, 4);
  if (!MAGICS.has(magic)) {
    throw new NotAnArchiveError(`Invalid BIG file magic: '${magic}'`);
  }

  const archiveSize = buffer.readUInt32LE(4);
  const entryCount = buffer.readUInt32BE(8);
  const dataOffset = buffer.readUInt32BE(12);

  return {
    archiveSize,
    dataOffset,
    magic,
    entryCount,
  };
};

export const parseIndexTable = (
  table: Buffer,
  entryCount: number,
): { entries: BigFileEntry[]; tableLength: number } => {
  const entries: BigFileEntry[] = [];
  let cursor = 0;

  for (let entryNumber = 0; entryNumber < entryCount; entryNumber++) {
    if (cursor + 8 > table.length) {
      throw new Error(
        `Index table ends after ${entryNumber} of ${entryCount} entries`,
      );
    }

    const offset = table.readUInt32BE(cursor);
    const size = table.readUInt32BE(cursor + 4);

    const nameStart = cursor + 8;
    let nameEnd = nameStart;

    while (nameEnd < table.length && table[nameEnd] !== 0) {
      nameEnd++;
    }

    if (nameEnd >= table.length) {
      throw new Error(`Unterminated name in index table entry ${entryNumber}`);
    }

    const storedName = table.toString(NAME_ENCODING, nameStart, nameEnd);
    const name = toTreeName(storedName);

    if (!isContainedPath(name)) {
      throw new Error(
        `Unsafe name '${name}' in index table entry ${entryNumber}`,
      );
    }

    entries.push({ name, storedName, offset, size });

    cursor = nameEnd + 1;
  }

  return { entries, tableLength: cursor };
};

export const computeArchiveLayout = (
  entries: readonly BigFileEntry[] | ReadonlyMap<string, BigFileEntry>,
  trailer: Uint8Array = new Uint8Array(0),
): ArchiveLayout => {
  const entriesArray = Array.isArray(entries)
    ? entries
    : Array.from(entries.values());

  const indexTableEndOffset = entriesArray.reduce(
    (total, entry) =>
      total + 8 + Buffer.byteLength(getStoredName(entry), NAME_ENCODING) + 1,
    HEADER_LENGTH,
  );

  const placedEntries: PlacedEntry[] = [];
  const firstDataOffset = indexTableEndOffset + trailer.length;
  let dataOffset = firstDataOffset;

  entriesArray.forEach((entry) => {
    const size = entry.pendingData?.length ?? entry.size;
    placedEntries.push({ entry, offset: dataOffset, size });
    dataOffset = alignBytes(dataOffset + size);
  });

  const last = placedEntries[placedEntries.length - 1];
  const totalSize = last ? last.offset + last.size : firstDataOffset;

  return {
    placedEntries,
    indexTableEndOffset,
    trailer,
    dataOffset: firstDataOffset,
    totalSize,
  };
};

const writeIndexTableEntry = (
  buffer: Buffer,
  offset: number,
  placedEntry: PlacedEntry,
): number => {
  buffer.writeUInt32BE(placedEntry.offset, offset);
  buffer.writeUInt32BE(placedEntry.size, offset + 4);

  const nameBytes = Buffer.from(
    getStoredName(placedEntry.entry),
    NAME_ENCODING,
  );
  nameBytes.copy(buffer, offset + 8);
  buffer[offset + 8 + nameBytes.length] = 0;

  return offset + 8 + nameBytes.length + 1;
};

export const serializeIndexTable = (
  magic: string,
  layout: ArchiveLayout,
): Buffer => {
  const { placedEntries, indexTableEndOffset, trailer, dataOffset, totalSize } =
    layout;
  const buffer = Buffer.alloc(dataOffset);

  buffer.write(magic, 0, 4, 'ascii');
  buffer.writeUInt32LE(totalSize, 4);
  buffer.writeUInt32BE(placedEntries.length, 8);
  buffer.writeUInt32BE(dataOffset, 12);

  let cursor = HEADER_LENGTH;
  placedEntries.forEach((placedEntry) => {
    cursor = writeIndexTableEntry(buffer, cursor, placedEntry);
  });

  buffer.set(trailer, indexTableEndOffset);

  return buffer;
};
