import { existsSync } from 'fs';
import { constants, copyFile, readFile, stat, utimes } from 'fs/promises';
import { writeFileAtomically } from './writeFileAtomically';

export const getOriginalPath = (filePath: string): string => `${filePath}.org`;

export const hasOriginal = (filePath: string): boolean =>
  existsSync(getOriginalPath(filePath));

export const getOriginalTime = async (filePath: string): Promise<number | undefined> => {
  try {
    return (await stat(getOriginalPath(filePath))).mtimeMs;
  } catch {
    return undefined;
  }
};

export type KeepResult = 'kept' | 'alreadyKept' | 'nothingToKeep';

const hasCode = (error: unknown, code: string): boolean =>
  (error as NodeJS.ErrnoException | undefined)?.code === code;

export const keepOriginal = async (filePath: string): Promise<KeepResult> => {
  const originalPath = getOriginalPath(filePath);

  try {
    await copyFile(filePath, originalPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (hasCode(error, 'EEXIST')) {
      return 'alreadyKept';
    }
    if (hasCode(error, 'ENOENT') && !existsSync(filePath)) {
      return 'nothingToKeep';
    }
    throw error;
  }

  const now = new Date();

  await utimes(originalPath, now, now);

  return 'kept';
};

export const writeKeepingOriginal = async (
  filePath: string,
  content: Uint8Array,
  isKeepingOriginal: boolean,
  keep: (filePath: string) => Promise<KeepResult> = keepOriginal,
): Promise<KeepResult | undefined> => {
  const kept = isKeepingOriginal ? await keep(filePath) : undefined;

  await writeFileAtomically(filePath, content);

  return kept;
};

export const restoreOriginal = async (filePath: string): Promise<void> => {
  await writeFileAtomically(filePath, await readFile(getOriginalPath(filePath)));
};
