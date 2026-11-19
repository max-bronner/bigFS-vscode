import { ThemeIcon, Uri, commands, window } from 'vscode';
import type { ExtensionContext, QuickPickItem } from 'vscode';
import { formatCount } from '../../core/messages';
import { rankFiles } from '../../core/rankFiles';
import type { RankableFile } from '../../core/rankFiles';
import { listFileCopies } from '../../game/install/listFileCopies';
import type { FileCopy } from '../../game/install/listFileCopies';
import type {
  GameFileRef,
  GameViewModel,
  GameViewNode,
} from '../../services/archives/gameViewModel';
import { getNodeUri } from '../../services/archives/nodeAddress';

interface FinderFile extends RankableFile {
  uri: Uri;
  copy: FileCopy<GameFileRef>;
}

interface FinderItem extends QuickPickItem {
  file: FinderFile;
}

const MAX_ITEMS = 100;

const MAX_RECENT = 30;

const RECENT_STATE_KEY = 'bigfs.recentFiles';

const REVEAL_BUTTON = {
  iconPath: new ThemeIcon('list-tree'),
  tooltip: 'Reveal in BIG Archives',
};

const indexes = new WeakMap<GameViewNode, FinderFile[]>();

const getFinderFiles = (root: GameViewNode): FinderFile[] => {
  let files = indexes.get(root);

  if (!files) {
    files = listFileCopies(root).map((copy) => {
      const uri =
        copy.ref.kind === 'entry' ? getNodeUri(copy.ref.node) : copy.ref.uri;

      return {
        name: copy.name,
        path: copy.entryPath,
        key: uri.toString(),
        isPreferred: copy.isLoaded,
        uri,
        copy,
      };
    });
    indexes.set(root, files);
  }

  return files;
};

const toItem = (file: FinderFile): FinderItem => {
  const { copy } = file;
  const folder = copy.entryPath.slice(0, -copy.name.length).replace(/\/$/, '');
  const verdict =
    copy.copies < 2
      ? undefined
      : copy.isLoaded
        ? '$(check) The game loads this copy'
        : `$(circle-slash) Ignored by the game: ${copy.loadedFrom} loads it instead`;

  return {
    label: copy.name,
    description: [folder, copy.origin].filter(Boolean).join('  ·  '),
    detail: verdict,
    alwaysShow: true,
    buttons: [REVEAL_BUTTON],
    file,
  };
};

export const goToFile = async (
  context: ExtensionContext,
  gameView: GameViewModel,
): Promise<void> => {
  const pick = window.createQuickPick<FinderItem>();
  let files: FinderFile[] = [];

  const getRecent = (): string[] =>
    context.globalState.get<string[]>(RECENT_STATE_KEY, []);

  const refresh = (): void => {
    pick.items = rankFiles(pick.value, files, getRecent(), MAX_ITEMS).map(
      toItem,
    );
  };

  pick.matchOnDescription = true;
  (pick as { sortByLabel?: boolean }).sortByLabel = false;
  pick.placeholder = 'Loading the files of every archive...';
  pick.busy = true;
  pick.onDidChangeValue(refresh);
  pick.onDidTriggerItemButton(({ item }) => {
    const { uri, copy } = item.file;

    pick.hide();
    void commands.executeCommand(
      copy.ref.kind === 'entry' ? 'bigfs.revealEntry' : 'revealInExplorer',
      uri,
    );
  });
  pick.onDidAccept(() => {
    const [item] = pick.selectedItems;

    if (!item) {
      return;
    }

    void context.globalState.update(
      RECENT_STATE_KEY,
      [
        item.file.key,
        ...getRecent().filter((key) => key !== item.file.key),
      ].slice(0, MAX_RECENT),
    );
    pick.hide();
    void commands.executeCommand('vscode.open', item.file.uri);
  });
  pick.onDidHide(() => pick.dispose());
  pick.show();

  try {
    files = getFinderFiles(await gameView.getRoot());
    pick.placeholder = `Type a file name or path (${formatCount(files.length, 'file')})`;
    refresh();
  } finally {
    pick.busy = false;
  }
};
