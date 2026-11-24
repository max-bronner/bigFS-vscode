import type { Uri } from 'vscode';

export interface CatalogueChange {
  uri: Uri;
  cause: 'sync' | 'restore';
}

export const isChangeOf = (change: CatalogueChange, uri: Uri): boolean =>
  change.uri.fsPath.toLowerCase() === uri.fsPath.toLowerCase();
