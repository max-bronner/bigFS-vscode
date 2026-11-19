import { open, unlink } from 'fs/promises';
import { createEmptyArchive } from '../formats/big/emptyArchive';

export const createArchiveFile = async (archivePath: string): Promise<void> => {
  const file = await open(archivePath, 'wx');

  try {
    const bytes = createEmptyArchive();

    await file.write(bytes, 0, bytes.length, 0);
    await file.sync();
  } catch (error) {
    await file.close();
    await unlink(archivePath).catch(() => undefined);
    throw error;
  }

  await file.close();
};
