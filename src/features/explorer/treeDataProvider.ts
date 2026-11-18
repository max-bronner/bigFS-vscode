import type { Event } from 'vscode';
import { settings } from '../../platform/settings';
import {
  TreeItem,
  TreeDataProvider,
  EventEmitter,
  ThemeIcon,
  TreeItemCollapsibleState,
  FileType,
} from 'vscode';
import { formatCount } from '../../core/messages';
import { countFileNodes, isArchiveRoot } from '../../services/archives/virtualNode';
import { getNodePath, getNodeUri } from '../../services/archives/nodeAddress';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { VirtualNode } from '../../services/archives/virtualNode';
import {
  isFolderNode,
  isGameRow,
  isSourceNode,
  isVirtualNode,
} from '../../services/archives/explorerRow';
import type { ExplorerNode, FolderNode, GameRow } from '../../services/archives/explorerRow';
import { GameViewModel } from '../../services/archives/gameViewModel';
import { getGameFiles } from '../../game/install/gameView';

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const compareRows = (a: ExplorerNode, b: ExplorerNode): number => {
  const aIsBranch = isBranch(a);
  const bIsBranch = isBranch(b);

  if (aIsBranch !== bIsBranch) {
    return aIsBranch ? -1 : 1;
  }

  return nameCollator.compare(rowName(a), rowName(b));
};

const isBranch = (element: ExplorerNode): boolean =>
  isGameRow(element)
    ? Boolean(element.node.children)
    : !isVirtualNode(element) || element.type === FileType.Directory;

const rowName = (element: ExplorerNode): string =>
  isSourceNode(element)
    ? element.source.label
    : isGameRow(element)
      ? element.node.name
      : element.name;

const READ_ONLY_SUFFIX = 'ReadOnly';

export const isGameViewShown = (): boolean =>
  settings.explorerView.get() === 'game';

const createGameItem = (
  { node }: GameRow,
  isReadOnly: (node: VirtualNode) => boolean,
): TreeItem => {
  if (node.children) {
    const item = new TreeItem(node.name, TreeItemCollapsibleState.Collapsed);

    item.id = `game:/${node.path}`;
    item.iconPath = ThemeIcon.Folder;
    item.contextValue = 'bigGameFolder';
    item.description = `(${formatCount(getGameFiles(node).length, 'file')})`;

    return item;
  }

  const winner = node.winner!;
  const uri =
    winner.ref.kind === 'entry' ? getNodeUri(winner.ref.node) : winner.ref.uri;
  const item = new TreeItem(node.name, TreeItemCollapsibleState.None);

  item.id = `game:/${node.path}`;
  item.resourceUri = uri;
  item.description = node.shadowed?.length
    ? `${winner.origin} · overrides ${node.shadowed.length}`
    : winner.origin;
  item.tooltip = [
    `${node.path}`,
    `Loaded from ${winner.origin}`,
    ...(node.shadowed ?? []).map((copy) => `Ignored in ${copy.origin}`),
  ].join('\n');
  item.contextValue =
    winner.ref.kind === 'entry'
      ? `bigFile${isReadOnly(winner.ref.node) ? READ_ONLY_SUFFIX : ''}`
      : 'bigLooseFile';
  item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };

  return item;
};

const sortRows = (rows: ExplorerNode[]): ExplorerNode[] =>
  rows.sort(compareRows);

export class BigTreeItem extends TreeItem {
  constructor(
    public readonly node: VirtualNode,
    public readonly collapsibleState: TreeItemCollapsibleState,
    isLoaded = true,
    isReadOnly = false,
  ) {
    super(node.name, collapsibleState);

    const suffix = isReadOnly ? READ_ONLY_SUFFIX : '';

    this.id = getNodePath(node);
    this.resourceUri = getNodeUri(node);
    this.tooltip = getNodePath(node);

    if (node.type === FileType.File) {
      this.contextValue = `bigFile${suffix}`;
      this.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [this.resourceUri],
      };

      return;
    }

    this.contextValue = `${isArchiveRoot(node) ? 'bigArchive' : 'bigFolder'}${suffix}`;

    if (isLoaded) {
      this.description = `(${formatCount(countFileNodes(node), 'file')})`;
    }
  }
}

export class BigTreeDataProvider implements TreeDataProvider<ExplorerNode> {
  private _onDidChangeTreeData: EventEmitter<ExplorerNode | undefined | void> =
    new EventEmitter<ExplorerNode | undefined | void>();
  readonly onDidChangeTreeData: Event<ExplorerNode | undefined | void> =
    this._onDidChangeTreeData.event;

  constructor(
    private archiveModel: ArchiveModel,
    private gameView: GameViewModel = new GameViewModel(archiveModel),
  ) {
    gameView.onDidChange(() => {
      if (isGameViewShown()) {
        this.refresh();
      }
    });

    this.archiveModel.onDidChangeArchive((change) => {
      const archive =
        change.type === 'changed' &&
        this.archiveModel.getArchiveByPath(change.archivePath);

      if (archive) {
        this._onDidChangeTreeData.fire(archive.root);
        return;
      }

      this.refresh();
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ExplorerNode): TreeItem {
    if (isSourceNode(element)) {
      const item = new TreeItem(
        element.source.label,
        TreeItemCollapsibleState.Expanded,
      );

      item.id = `/${element.source.id}`;
      item.iconPath = new ThemeIcon('root-folder');
      item.resourceUri = element.source.baseUri;
      item.contextValue = 'bigSource';

      return item;
    }

    if (isFolderNode(element)) {
      const item = new TreeItem(
        element.name,
        TreeItemCollapsibleState.Collapsed,
      );

      item.id = `/${element.sourceId}/${element.path}`;
      item.iconPath = ThemeIcon.Folder;
      item.contextValue = 'bigDiskFolder';

      return item;
    }

    if (isGameRow(element)) {
      return createGameItem(element, (node) =>
        this.archiveModel.isReadOnly(node.archive),
      );
    }

    return new BigTreeItem(
      element,
      element.type === FileType.Directory
        ? TreeItemCollapsibleState.Collapsed
        : TreeItemCollapsibleState.None,
      !isArchiveRoot(element) || this.archiveModel.isLoaded(element),
      this.archiveModel.isReadOnly(element.archive),
    );
  }

  async getChildren(element?: ExplorerNode): Promise<ExplorerNode[]> {
    if (!element && isGameViewShown()) {
      return this.listGameRows(await this.gameView.getRoot());
    }

    if (!element) {
      await this.archiveModel.whenReady();

      const sources = this.archiveModel.getSources();

      return sources.length === 1
        ? this.listIn(sources[0].id, '')
        : sortRows(sources.map((source) => ({ kind: 'source', source })));
    }

    if (isGameRow(element)) {
      return this.listGameRows(element.node);
    }

    if (isSourceNode(element)) {
      return this.listIn(element.source.id, '');
    }

    if (isFolderNode(element)) {
      return this.listIn(element.sourceId, element.path);
    }

    if (element.type !== FileType.Directory) {
      return [];
    }

    if (isArchiveRoot(element)) {
      await this.archiveModel.loadArchiveOf(element);
    }

    return sortRows(Array.from(element.children?.values() ?? []));
  }

  private listGameRows(node: GameRow['node']): ExplorerNode[] {
    return sortRows(
      Array.from(node.children?.values() ?? [], (child) => ({
        kind: 'game' as const,
        node: child,
      })),
    );
  }

  private listIn(sourceId: string, directoryPath: string): ExplorerNode[] {
    const prefix = directoryPath ? `${directoryPath}/` : '';
    const folders = new Map<string, FolderNode>();
    const rows: ExplorerNode[] = [];

    for (const archive of this.archiveModel.getArchivesOf(sourceId)) {
      if (!archive.pathInSource.startsWith(prefix)) {
        continue;
      }

      const rest = archive.pathInSource.slice(prefix.length);
      const separator = rest.indexOf('/');

      if (separator < 0) {
        rows.push(archive.root);
        continue;
      }

      const name = rest.slice(0, separator);

      folders.set(name, {
        kind: 'folder',
        sourceId,
        path: `${prefix}${name}`,
        name,
      });
    }

    return sortRows([...folders.values(), ...rows]);
  }
}
