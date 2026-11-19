import * as vscode from 'vscode';

const listings = new Map<string, Promise<[string, vscode.FileType][]>>();

export const listFolder = (folder: vscode.Uri) => {
  const key = folder.toString();
  let listing = listings.get(key);

  if (!listing) {
    listing = Promise.resolve(vscode.workspace.fs.readDirectory(folder)).catch(
      () => [],
    );
    listings.set(key, listing);
  }
  return listing;
};

export const clearFolderListings = (): void => listings.clear();
