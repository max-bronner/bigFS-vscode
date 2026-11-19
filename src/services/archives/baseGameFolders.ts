import { execFile } from 'child_process';
import { readdir } from 'fs/promises';
import {
  detectInstallKind,
  orderLayers,
  parseRegistryPath,
} from '../../game/install/installLayers';
import type { InstallKind } from '../../game/install/installLayers';
import { settings } from '../../platform/settings';

const BFME2_KEY =
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\lotrbfme2.exe';

const hasFile = async (folder: string, file: string): Promise<boolean> => {
  try {
    return (await readdir(folder)).some((name) => name.toLowerCase() === file);
  } catch {
    return false;
  }
};

const queryBfme2Folder = (): Promise<string | undefined> =>
  new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(undefined);
      return;
    }

    execFile(
      'reg',
      ['query', BFME2_KEY, '/v', 'Path', '/reg:32'],
      (error, stdout) => resolve(error ? undefined : parseRegistryPath(stdout)),
    );
  });

export const findBaseGameFolders = async (): Promise<string[]> => {
  const base = settings.baseGameFolder.get().trim();
  const named = settings.underlyingGameFolder.get().trim();
  const folders: string[] = [];

  if (base) {
    folders.push(base);
  }

  if (named) {
    folders.push(named);
  } else if (
    base &&
    detectInstallKind(await readdir(base).catch(() => [])) === 'rotwk'
  ) {
    const found = await queryBfme2Folder();

    if (found && (await hasFile(found, 'lotrbfme2.exe'))) {
      folders.push(found);
    }
  }

  const existing: string[] = [];

  for (const folder of folders) {
    if (
      !existing.some((held) => held.toLowerCase() === folder.toLowerCase()) &&
      (await readdir(folder).then(
        () => true,
        () => false,
      ))
    ) {
      existing.push(folder);
    }
  }

  const layers: { folder: string; kind: InstallKind; base: true }[] = [];

  for (const folder of existing) {
    layers.push({
      folder,
      kind: detectInstallKind(await readdir(folder).catch(() => [])),
      base: true,
    });
  }

  return orderLayers(layers).map(({ folder }) => folder);
};
