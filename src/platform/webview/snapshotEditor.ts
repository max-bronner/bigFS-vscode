import * as vscode from "vscode";

export interface SnapshotDocument<T> extends vscode.CustomDocument {
  snapshot: T;
  readonly isReadOnly: boolean;
  readonly views: Set<() => unknown>;
}

export interface SnapshotFormat<T> {
  read(bytes: Uint8Array): T;
  write(snapshot: T): Uint8Array;
}

export interface SnapshotEditEvents<D extends vscode.CustomDocument> {
  fire(event: vscode.CustomDocumentEditEvent<D>): void;
}

export const readSnapshotSource = (
  uri: vscode.Uri,
  backupId: string | undefined,
): Thenable<Uint8Array> =>
  vscode.workspace.fs.readFile(backupId ? vscode.Uri.parse(backupId) : uri);

export const isReadOnlyFile = async (uri: vscode.Uri): Promise<boolean> => {
  const stat = await vscode.workspace.fs.stat(uri).then(
    (found) => found,
    () => undefined,
  );

  return ((stat?.permissions ?? 0) & vscode.FilePermission.Readonly) !== 0;
};

export const createSnapshotDocument = <T>(
  uri: vscode.Uri,
  snapshot: T,
  isReadOnly: boolean,
): SnapshotDocument<T> => {
  const views = new Set<() => unknown>();

  return {
    uri,
    snapshot,
    isReadOnly,
    views,
    dispose: () => views.clear(),
  };
};

export const redrawSnapshotViews = <T>(document: SnapshotDocument<T>): void =>
  document.views.forEach((send) => void send());

export const addSnapshotView = <T>(
  document: SnapshotDocument<T>,
  panel: vscode.WebviewPanel,
  send: () => unknown,
): void => {
  document.views.add(send);
  panel.onDidDispose(() => document.views.delete(send));
};

export const recordSnapshotEdit = <T, D extends SnapshotDocument<T>>(
  events: SnapshotEditEvents<D>,
  document: D,
  label: string,
  after: T,
): void => {
  const before = document.snapshot;

  document.snapshot = after;
  events.fire({
    document,
    label,
    undo: () => {
      document.snapshot = before;
      redrawSnapshotViews(document);
    },
    redo: () => {
      document.snapshot = after;
      redrawSnapshotViews(document);
    },
  });
};

export const saveSnapshot = async <T>(
  document: SnapshotDocument<T>,
  format: SnapshotFormat<T>,
  destination: vscode.Uri = document.uri,
): Promise<void> => {
  await vscode.workspace.fs.writeFile(
    destination,
    format.write(document.snapshot),
  );
};

export const revertSnapshot = async <T>(
  document: SnapshotDocument<T>,
  format: SnapshotFormat<T>,
): Promise<void> => {
  document.snapshot = format.read(
    await vscode.workspace.fs.readFile(document.uri),
  );
  redrawSnapshotViews(document);
};

export const backupSnapshot = async <T>(
  document: SnapshotDocument<T>,
  format: SnapshotFormat<T>,
  context: vscode.CustomDocumentBackupContext,
): Promise<vscode.CustomDocumentBackup> => {
  await saveSnapshot(document, format, context.destination);

  return {
    id: context.destination.toString(),
    delete: () => vscode.workspace.fs.delete(context.destination),
  };
};
