import { EventEmitter, FileType, Uri } from 'vscode';
import type { Disposable } from 'vscode';
import { createDebouncer } from '../../core/debounce';
import type { ArchiveModel } from './archiveModel';
import { getFileNodes } from './virtualTree';
import type { VirtualNode } from './virtualNode';
import { buildGameTree, indexByName, orderInstallFiles } from '../../game/install/gameView';
import type { GameNode, InstallFiles } from '../../game/install/gameView';
import { GAME_FOLDERS, listLooseFiles } from '../../node/installScan';
import * as path from 'path';
import { ASSET_CATALOGUE_NAME } from '../../formats/asset/assetCatalogue';
import { findAssetCatalogue } from './findAssetCatalogue';

export type GameFileRef =
  | { kind: 'entry'; node: VirtualNode; base?: boolean }
  | { kind: 'loose'; uri: Uri; base?: boolean };

export type GameViewNode = GameNode<GameFileRef>;

export const REBUILD_DELAY = 250;

export class GameViewModel implements Disposable {
  private tree?: Promise<GameViewNode>;
  private names?: Promise<Map<string, GameViewNode>>;
  private readonly onDidChangeEmitter = new EventEmitter<void>();
  private isStale = false;
  private readonly announce = createDebouncer(() => {
    if (this.isStale) {
      this.isStale = false;
      this.onDidChangeEmitter.fire();
    }
  }, REBUILD_DELAY);
  private readonly subscriptions: Disposable[];

  public readonly onDidChange = this.onDidChangeEmitter.event;

  public constructor(private readonly archiveModel: ArchiveModel) {
    this.subscriptions = [
      this.onDidChangeEmitter,
      archiveModel.onDidChangeArchive((change) => {
        if (!change.loaded) {
          this.forget();
        }
      }),
      archiveModel.onDidScan(() => this.invalidate()),
      { dispose: () => this.announce.cancel() },
    ];
  }

  public dispose(): void {
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }

  public invalidate(): void {
    this.announce.cancel();
    this.isStale = false;
    this.names = undefined;

    if (this.tree) {
      this.tree = undefined;
      this.onDidChangeEmitter.fire();
    }
  }

  private forget(): void {
    this.names = undefined;

    if (this.tree) {
      this.tree = undefined;
      this.isStale = true;
      this.announce.schedule();
    }
  }

  public getRoot(): Promise<GameViewNode> {
    this.tree ??= this.build();

    return this.tree;
  }

  public getNames(): Promise<Map<string, GameViewNode>> {
    this.names ??= this.getRoot().then(indexByName);

    return this.names;
  }

  private async build(): Promise<GameViewNode> {
    await this.archiveModel.whenReady();

    const installs: InstallFiles<GameFileRef>[] = [];
    const topFolders = new Set(GAME_FOLDERS);
    const sources = this.archiveModel.getSources();

    for (const source of sources) {
      const archives: InstallFiles<GameFileRef>['archives'] = [];

      for (const archive of this.archiveModel.getArchivesOf(source.id)) {
        try {
          await this.archiveModel.loadArchiveOf(archive.root);
        } catch {
          continue;
        }

        archives.push({
          pathInInstall: archive.pathInSource,
          files: getFileNodes(archive.root).map((node) => {
            topFolders.add(node.entryPath.split('/')[0].toLowerCase());

            return {
              entryPath: node.entryPath,
              ref: { kind: 'entry' as const, node, base: source.base },
              origin: archive.pathInSource,
            };
          }),
        });
      }

      installs.push({ loose: [], archives });
    }

    for (const [index, source] of sources.entries()) {
      if (source.baseUri.scheme !== 'file') {
        continue;
      }

      const catalogue = await findAssetCatalogue(source);

      installs[index].loose = [
        ...(catalogue ? [ASSET_CATALOGUE_NAME] : []),
        ...(await listLooseFiles(source.baseUri.fsPath, topFolders)),
      ].map((entryPath) => ({
        entryPath,
        ref: {
          kind: 'loose' as const,
          uri: Uri.file(
            path.join(source.baseUri.fsPath, ...entryPath.split('/')),
          ),
          base: source.base,
        },
        origin: `${source.label} (loose)`,
      }));
    }

    return buildGameTree(orderInstallFiles(installs));
  }
}

export const toEntryDirectory = (
  directory: GameViewNode,
): VirtualNode | undefined => {
  const build = (node: GameViewNode): VirtualNode | undefined => {
    if (!node.children) {
      return node.winner?.ref.kind === 'entry'
        ? node.winner.ref.node
        : undefined;
    }

    const children = new Map<string, VirtualNode>();

    for (const [key, child] of node.children) {
      const built = build(child);

      if (built) {
        children.set(key, built);
      }
    }

    const [first] = children.values();

    return first
      ? {
          name: node.name,
          type: FileType.Directory,
          entryPath: node.path,
          archive: first.archive,
          children,
        }
      : undefined;
  };

  return build(directory);
};
