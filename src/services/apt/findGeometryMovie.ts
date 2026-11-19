import * as vscode from 'vscode';
import { findBelow } from './findBelow';
import { clearFolderListings } from './folderListing';

export const getGeometryMovieName = (ruUri: vscode.Uri): string | undefined =>
  /^(.+)_geometry$/i.exec(ruUri.path.split('/').slice(-2)[0] ?? '')?.[1];

export const findGeometryMovie = async (
  ruUri: vscode.Uri,
): Promise<vscode.Uri | undefined> => {
  const movie = getGeometryMovieName(ruUri);

  clearFolderListings();
  return movie
    ? findBelow(
        vscode.Uri.joinPath(ruUri, '..', '..'),
        `${movie}.apt`,
        vscode.FileType.File,
      )
    : undefined;
};
