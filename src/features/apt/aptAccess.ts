import * as vscode from 'vscode';
import type { MovieAccess } from '../../formats/apt/aptIntegrity';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { getNodeUri } from '../../services/archives/nodeAddress';
import { getFileNodes } from '../../services/archives/virtualTree';
import { findBelow } from '../../services/apt/findBelow';
import { clearFolderListings, listFolder } from '../../services/apt/folderListing';

export const createMovieAccess = (
  aptUri: vscode.Uri,
  name: string,
  apt: Uint8Array,
  added: Map<string, Uint8Array> = new Map(),
): MovieAccess => {
  const folder = vscode.Uri.joinPath(aptUri, '..');
  const addedByLower = new Map(
    [...added].map(([path, bytes]) => [path.toLowerCase(), bytes]),
  );

  clearFolderListings();

  return {
    name,
    apt,
    async read(relative) {
      const pending = addedByLower.get(relative.toLowerCase());

      if (pending) {
        return pending.length ? pending : undefined;
      }

      const uri = await findBelow(folder, relative, vscode.FileType.File);

      return uri
        ? Promise.resolve(vscode.workspace.fs.readFile(uri)).catch(
            () => undefined,
          )
        : undefined;
    },
    async list(relative) {
      const uri = await findBelow(folder, relative, vscode.FileType.Directory);
      const prefix = relative.toLowerCase() + '/';
      const removed = new Set(
        [...added]
          .filter(
            ([path, bytes]) =>
              !bytes.length && path.toLowerCase().startsWith(prefix),
          )
          .map(([path]) => path.slice(prefix.length).toLowerCase()),
      );
      const names = new Set([
        ...(uri ? await listFolder(uri) : [])
          .filter(([, kind]) => kind & vscode.FileType.File)
          .map(([each]) => each),
        ...[...added.keys()]
          .filter((path) => path.toLowerCase().startsWith(prefix))
          .map((path) => path.slice(prefix.length))
          .filter((each) => !each.includes('/')),
      ]);

      const left = [...names].filter(
        (each) => !removed.has(each.toLowerCase()),
      );

      return uri || left.length ? left : undefined;
    },
  };
};

export const findWorkspaceMovies = async (
  archiveModel: ArchiveModel,
): Promise<vscode.Uri[]> => {
  await archiveModel.whenReady();

  const movies = await vscode.workspace.findFiles(
    '**/*.{apt,APT}',
    '**/node_modules/**',
  );

  for (const archive of archiveModel.getArchiveRoots()) {
    try {
      await archiveModel.loadArchiveOf(archive);
    } catch {
      continue;
    }
    movies.push(
      ...getFileNodes(archive)
        .filter((node) => /\.apt$/i.test(node.name))
        .map(getNodeUri),
    );
  }
  return movies;
};

export const findBeside = (
  aptUri: vscode.Uri,
  relative: string,
  type: vscode.FileType,
): Promise<vscode.Uri | undefined> => {
  clearFolderListings();
  return findBelow(vscode.Uri.joinPath(aptUri, '..'), relative, type);
};

export const listBeside = async (
  aptUri: vscode.Uri,
  relative: string,
): Promise<[string, vscode.FileType][]> => {
  const folder = await findBeside(aptUri, relative, vscode.FileType.Directory);

  return folder ? listFolder(folder) : [];
};
