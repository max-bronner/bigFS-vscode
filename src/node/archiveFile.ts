import { open, rename, unlink } from 'fs/promises';
import type { FileHandle } from 'fs/promises';
import {
  HEADER_LENGTH,
  NotAnArchiveError,
  parseHeader,
  parseIndexTable,
  computeArchiveLayout,
  serializeIndexTable,
} from '../formats/big/bigFormat';
import type { ArchiveLayout, BigFileEntry, ArchiveIndex } from '../formats/big/bigFormat';

const COPY_CHUNK_SIZE = 256 * 1024;

export const readArchiveIndexTable = async (
  archivePath: string,
): Promise<ArchiveIndex> => {
  const archiveFile = await open(archivePath, 'r');

  try {
    const headerBuffer = Buffer.alloc(HEADER_LENGTH);
    const { bytesRead: headerBytesRead } = await archiveFile.read(
      headerBuffer,
      0,
      HEADER_LENGTH,
      0,
    );

    if (headerBytesRead < HEADER_LENGTH) {
      throw new NotAnArchiveError('File too small to hold a BIG header');
    }

    const header = parseHeader(headerBuffer);
    const { size: fileSize } = await archiveFile.stat();

    const hasInvalidDataOffset =
      header.dataOffset < HEADER_LENGTH || header.dataOffset > fileSize;

    if (hasInvalidDataOffset) {
      throw new Error(
        `Entry data starts at ${header.dataOffset}, ` +
          `outside the archive of ${fileSize} bytes`,
      );
    }

    const tableLength = header.dataOffset - HEADER_LENGTH;
    const table = Buffer.alloc(tableLength);

    if (tableLength) {
      const { bytesRead: tableBytesRead } = await archiveFile.read(
        table,
        0,
        tableLength,
        HEADER_LENGTH,
      );

      if (tableBytesRead < tableLength) {
        throw new Error(
          `Archive ends inside its index table, ${tableBytesRead} of ${tableLength} bytes`,
        );
      }
    }

    const indexTable = parseIndexTable(table, header.entryCount);

    indexTable.entries.forEach((entry) => {
      if (entry.offset + entry.size > fileSize) {
        throw new Error(
          `Entry '${entry.name}' spans ${entry.offset} to ` +
            `${entry.offset + entry.size}, past the archive end at ${fileSize}`,
        );
      }
    });

    return {
      magic: header.magic,
      trailer: Uint8Array.from(table.subarray(indexTable.tableLength)),
      entries: indexTable.entries,
    };
  } finally {
    await archiveFile.close();
  }
};

export interface ArchiveReader {
  readEntry(entry: BigFileEntry): Promise<Uint8Array>;
  close(): Promise<void>;
}

export const openArchiveReader = async (
  archivePath: string,
): Promise<ArchiveReader> => {
  const archiveFile = await open(archivePath, 'r');

  return {
    async readEntry(entry: BigFileEntry): Promise<Uint8Array> {
      if (entry.pendingData) {
        return entry.pendingData;
      }

      if (!entry.size) {
        return Buffer.alloc(0);
      }

      const buffer = Buffer.alloc(entry.size);
      const { bytesRead } = await archiveFile.read(
        buffer,
        0,
        entry.size,
        entry.offset,
      );

      if (bytesRead < entry.size) {
        throw new Error(
          `Archive ends inside entry '${entry.name}', ` +
            `${bytesRead} of ${entry.size} bytes`,
        );
      }

      return buffer;
    },
    close: () => archiveFile.close(),
  };
};

export const readEntryData = async (
  archivePath: string,
  entry: BigFileEntry,
): Promise<Uint8Array> => {
  if (entry.pendingData) {
    return entry.pendingData;
  }

  if (!entry.size) {
    return Buffer.alloc(0);
  }

  const reader = await openArchiveReader(archivePath);

  try {
    return await reader.readEntry(entry);
  } finally {
    await reader.close();
  }
};

const copyEntryData = async (
  sourceFile: FileHandle,
  targetFile: FileHandle,
  sourceOffset: number,
  targetOffset: number,
  size: number,
): Promise<void> => {
  const buffer = Buffer.alloc(Math.min(COPY_CHUNK_SIZE, size));
  let copied = 0;

  while (copied < size) {
    const chunk = Math.min(buffer.length, size - copied);
    const { bytesRead } = await sourceFile.read(
      buffer,
      0,
      chunk,
      sourceOffset + copied,
    );

    if (!bytesRead) {
      throw new Error('Unexpected end of archive while copying entry data');
    }

    await targetFile.write(buffer, 0, bytesRead, targetOffset + copied);
    copied += bytesRead;
  }
};

export const writeArchiveFile = async (
  archivePath: string,
  { magic, trailer }: Pick<ArchiveIndex, 'magic' | 'trailer'>,
  entries: readonly BigFileEntry[] | ReadonlyMap<string, BigFileEntry>,
): Promise<ArchiveLayout> => {
  const layout = computeArchiveLayout(entries, trailer);
  const indexTable = serializeIndexTable(magic, layout);

  const tempPath = `${archivePath}.${process.pid}.tmp`;

  try {
    const tempFile = await open(tempPath, 'w');

    let sourceFile: FileHandle | undefined;

    try {
      await tempFile.write(indexTable, 0, indexTable.length, 0);

      for (const { entry, offset, size } of layout.placedEntries) {
        if (!size) {
          continue;
        }

        if (entry.pendingData) {
          await tempFile.write(entry.pendingData, 0, size, offset);
          continue;
        }

        if (entry.pendingFile) {
          const importedFile = await open(entry.pendingFile, 'r');

          try {
            await copyEntryData(importedFile, tempFile, 0, offset, size);
          } finally {
            await importedFile.close();
          }

          continue;
        }

        sourceFile ??= await open(archivePath, 'r');
        await copyEntryData(sourceFile, tempFile, entry.offset, offset, size);
      }

      await tempFile.truncate(layout.totalSize);
      await tempFile.sync();
    } finally {
      await sourceFile?.close().catch(() => undefined);
      await tempFile.close();
    }

    await rename(tempPath, archivePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }

  return layout;
};

export const IN_PLACE_THRESHOLD = 64 * 1024 * 1024;

export const writeEntryInPlace = async (
  archivePath: string,
  entry: BigFileEntry,
  data: Uint8Array,
): Promise<boolean> => {
  const archiveFile = await open(archivePath, 'r+');

  try {
    const headerBuffer = Buffer.alloc(HEADER_LENGTH);

    await archiveFile.read(headerBuffer, 0, HEADER_LENGTH, 0);

    const header = parseHeader(headerBuffer);
    const table = Buffer.alloc(header.dataOffset - HEADER_LENGTH);

    await archiveFile.read(table, 0, table.length, HEADER_LENGTH);

    const { entries } = parseIndexTable(table, header.entryCount);

    let recordAt = HEADER_LENGTH;
    let record: BigFileEntry | undefined;

    for (const candidate of entries) {
      const isEntry =
        candidate.offset === entry.offset &&
        candidate.size === entry.size &&
        candidate.name.toLowerCase() === entry.name.toLowerCase() &&
        (entry.storedName === undefined ||
          candidate.storedName === entry.storedName);

      if (isEntry) {
        record = candidate;
        break;
      }

      recordAt += 9 + Buffer.byteLength(candidate.storedName ?? '', 'latin1');
    }

    if (!record) {
      return false;
    }

    const followers = entries.filter(
      (candidate) =>
        candidate !== record &&
        (candidate.offset > record.offset ||
          (candidate.offset === record.offset &&
            (candidate.size > 0 || record.size === 0))),
    );
    const nextOffset = Math.min(
      ...followers.map((candidate) => candidate.offset),
    );
    const isLast = followers.length === 0;

    if (!isLast && record.offset + data.length > nextOffset) {
      return false;
    }

    await archiveFile.write(data, 0, data.length, record.offset);

    const size = Buffer.alloc(4);

    size.writeUInt32BE(data.length, 0);
    await archiveFile.write(size, 0, 4, recordAt + 4);

    if (isLast) {
      const end = record.offset + data.length;
      const total = Buffer.alloc(4);

      await archiveFile.truncate(end);
      total.writeUInt32LE(end, 0);
      await archiveFile.write(total, 0, 4, 4);
    }

    await archiveFile.sync();

    return true;
  } finally {
    await archiveFile.close();
  }
};
