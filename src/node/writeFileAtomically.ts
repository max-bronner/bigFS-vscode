import { open, rename, unlink } from 'fs/promises';

export const writeFileAtomically = async (
  filePath: string,
  content: Uint8Array,
): Promise<void> => {
  const tempPath = `${filePath}.${process.pid}.tmp`;

  try {
    const file = await open(tempPath, 'w');

    try {
      await file.write(content, 0, content.length, 0);
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
};
