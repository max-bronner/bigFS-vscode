import * as vscode from 'vscode';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { ArchiveSource } from '../../services/archives/archiveSource';
import { compareArchivePaths } from '../../game/install/gameView';
import { getNodeUri } from '../../services/archives/nodeAddress';
import { findChild } from '../../services/archives/virtualTree';

export interface MovieLocation {
  uri: vscode.Uri;
  origin: string;
}

export const toMovieKey = (name: string): string =>
  name.toLowerCase().replace(/\.apt$/, '');

export class AptLibrary implements vscode.Disposable {
  private readonly locations = new Map<
    string,
    Promise<MovieLocation | undefined>
  >();
  private readonly onDidChangeEmitter = new vscode.EventEmitter<void>();
  private readonly subscriptions: vscode.Disposable[];

  public readonly onDidChange = this.onDidChangeEmitter.event;

  public constructor(private readonly archiveModel: ArchiveModel) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{apt,APT,const,CONST,dat,DAT,ru,RU,tga,TGA}',
    );
    const forget = () => this.forget();

    this.subscriptions = [
      this.onDidChangeEmitter,
      archiveModel.onDidChangeArchive(({ loaded }) => {
        if (!loaded) {
          forget();
        }
      }),
      archiveModel.onDidScan(forget),
      watcher,
      watcher.onDidCreate(forget),
      watcher.onDidChange(forget),
      watcher.onDidDelete(forget),
    ];
  }

  public dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  public forget(): void {
    this.locations.clear();
    this.onDidChangeEmitter.fire();
  }

  public async locate(
    name: string,
    from: vscode.Uri,
  ): Promise<MovieLocation | undefined> {
    await this.archiveModel.whenReady();

    const { loadOrder } = this.archiveModel;
    const key = `${loadOrder.getStackKey(from)}/${toMovieKey(name)}`;
    let location = this.locations.get(key);

    if (!location) {
      location = this.search(`${toMovieKey(name)}.apt`, loadOrder.getStack(from));
      this.locations.set(key, location);
    }
    return location;
  }

  private async search(
    fileName: string,
    stack: readonly ArchiveSource[],
  ): Promise<MovieLocation | undefined> {
    for (const source of stack) {
      const loose = await findLoose(source.baseUri, fileName);

      if (loose) {
        return { uri: loose, origin: `${source.label} (loose)` };
      }

      const archives = [...this.archiveModel.getArchivesOf(source.id)].sort(
        (a, b) => compareArchivePaths(a.pathInSource, b.pathInSource),
      );

      for (const archive of archives) {
        try {
          await this.archiveModel.loadArchiveOf(archive.root);
        } catch {
          continue;
        }

        const node = findChild(archive.root, fileName);

        if (node) {
          return { uri: getNodeUri(node), origin: archive.pathInSource };
        }
      }
    }
    return undefined;
  }
}

const findLoose = async (
  folder: vscode.Uri,
  fileName: string,
): Promise<vscode.Uri | undefined> => {
  try {
    const match = (await vscode.workspace.fs.readDirectory(folder)).find(
      ([name, type]) =>
        type === vscode.FileType.File &&
        name.toLowerCase() === fileName.toLowerCase(),
    );

    return match ? vscode.Uri.joinPath(folder, match[0]) : undefined;
  } catch {
    return undefined;
  }
};
