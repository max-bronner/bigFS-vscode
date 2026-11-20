import { FileType, Uri, workspace } from 'vscode';
import type { Disposable } from 'vscode';
import type { ArchiveModel } from './archives/archiveModel';
import type { GameViewModel, GameViewNode } from './archives/gameViewModel';
import { getNodeUri } from './archives/nodeAddress';
import type { VirtualNode } from './archives/virtualNode';

const LOOSE_ASSETS =
  '**/*.{w3d,W3D,dds,DDS,tga,TGA,jpg,JPG,png,PNG,wav,WAV,mp3,MP3}';

const getBaseName = (fileName: string): string =>
  fileName.slice(
    Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1,
  );

const findByPath = (
  root: GameViewNode,
  fileName: string,
): GameViewNode | undefined => {
  let node: GameViewNode | undefined = root;

  for (const segment of fileName.split(/[\\/]/).filter(Boolean)) {
    node = node.children?.get(segment.toLowerCase());

    if (!node) {
      return undefined;
    }
  }

  return node.winner ? node : undefined;
};

export class EntryLocator implements Disposable {
  private readonly allNames = new Map<string, Promise<Set<string>>>();
  private contentRevision = 0;
  private readonly subscriptions: Disposable[];

  public constructor(
    private readonly archiveModel: ArchiveModel,
    private readonly gameView: GameViewModel,
  ) {
    const watcher = workspace.createFileSystemWatcher(LOOSE_ASSETS);
    const folders = workspace.createFileSystemWatcher('**/*', true, true, false);
    const forgetLoose = () => this.forgetNames();

    this.subscriptions = [
      archiveModel.onDidChangeArchive(({ loaded }) => {
        if (!loaded) {
          this.forgetNames();
        }
      }),
      gameView.onDidChange(forgetLoose),
      watcher,
      watcher.onDidCreate(forgetLoose),
      watcher.onDidDelete(forgetLoose),
      folders,
      folders.onDidDelete(forgetLoose),
    ];
  }

  public get revision(): number {
    return this.contentRevision;
  }

  private forgetNames(): void {
    this.allNames.clear();
    this.contentRevision++;
  }

  public dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  public async getFileNames(from?: Uri): Promise<Set<string>> {
    await this.archiveModel.whenReady();

    const key = this.archiveModel.loadOrder.getStackKey(from);
    let names = this.allNames.get(key);

    if (!names) {
      names = (async () => {
        const uris = await workspace.findFiles(
          LOOSE_ASSETS,
          '**/node_modules/**',
          200_000,
        );
        const archived = await this.gameView.getNames(from);

        return new Set([
          ...archived.keys(),
          ...uris.map((uri) =>
            uri.path.slice(uri.path.lastIndexOf('/') + 1).toLowerCase(),
          ),
        ]);
      })();
      this.allNames.set(key, names);
    }
    return names;
  }

  public async recheck(fileNames: string[]): Promise<boolean> {
    const names = [...new Set(fileNames)].slice(0, 20);

    if (!names.length) {
      return false;
    }

    const [found] = await workspace.findFiles(
      names.length === 1 ? `**/${names[0]}` : `**/{${names.join(',')}}`,
      '**/node_modules/**',
      1,
    );

    if (found) {
      this.forgetNames();
    }
    return !!found;
  }

  public async read(
    fileName: string,
    nearUri: Uri,
  ): Promise<Uint8Array | undefined> {
    const found = await this.locate(fileName, nearUri);

    if (!found) {
      return undefined;
    }
    return 'node' in found
      ? this.archiveModel.getFileContent(found.node)
      : workspace.fs.readFile(found.uri);
  }

  public async findUri(
    fileName: string,
    nearUri: Uri,
  ): Promise<Uri | undefined> {
    const found = await this.locate(fileName, nearUri);

    return found && ('node' in found ? getNodeUri(found.node) : found.uri);
  }

  private async locate(
    fileName: string,
    nearUri: Uri,
  ): Promise<{ uri: Uri } | { node: VirtualNode } | undefined> {
    const name = getBaseName(fileName);
    const root = await this.gameView.getRoot(nearUri);
    const held =
      (/[\\/]/.test(fileName) ? findByPath(root, fileName) : undefined) ??
      (await this.gameView.getNames(nearUri)).get(name.toLowerCase());
    const winner = held?.winner?.ref;

    if (winner) {
      return winner.kind === 'entry'
        ? { node: winner.node }
        : { uri: winner.uri };
    }

    const beside = await this.findBeside(name, nearUri);

    if (beside) {
      return { uri: beside };
    }

    const [loose] = await workspace.findFiles(`**/${name}`, undefined, 1);

    return loose && { uri: loose };
  }

  public async findNames(
    matches: (lowerName: string) => boolean,
    loosePattern: string,
    from?: Uri,
  ): Promise<string[]> {
    const names = new Set(
      [...(await this.gameView.getNames(from)).keys()].filter((name) =>
        matches(name),
      ),
    );

    for (const uri of await workspace.findFiles(
      loosePattern,
      undefined,
      5000,
    )) {
      const name = uri.path.slice(uri.path.lastIndexOf('/') + 1).toLowerCase();

      if (matches(name)) {
        names.add(name);
      }
    }

    return [...names].sort();
  }

  private async findBeside(
    fileName: string,
    nearUri: Uri,
  ): Promise<Uri | undefined> {
    const directory = Uri.joinPath(nearUri, '..');

    try {
      const match = (await workspace.fs.readDirectory(directory)).find(
        ([name, type]) =>
          type === FileType.File &&
          name.toLowerCase() === fileName.toLowerCase(),
      );

      return match && Uri.joinPath(directory, match[0]);
    } catch {
      return undefined;
    }
  }
}
