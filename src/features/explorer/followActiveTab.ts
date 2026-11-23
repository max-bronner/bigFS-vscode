import { TabInputCustom, TabInputText, TabInputTextDiff, window, workspace } from 'vscode';
import type { Disposable, Tab, TreeView, Uri } from 'vscode';
import { SCHEME } from '../../constants';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import type { ExplorerRow } from '../../services/archives/explorerRow';
import type { GameViewModel } from '../../services/archives/gameViewModel';
import { revealEntry } from './revealEntry';

const FOLLOW_DELAY = 150;

const getTabUri = (tab: Tab | undefined): Uri | undefined => {
  const input = tab?.input;

  if (input instanceof TabInputText || input instanceof TabInputCustom) {
    return input.uri;
  }
  return input instanceof TabInputTextDiff ? input.modified : undefined;
};

const isAutoRevealOn = (): boolean =>
  workspace.getConfiguration('explorer').get<boolean | string>('autoReveal', true) !== false;

export const followActiveTab = (
  treeView: TreeView<ExplorerRow>,
  archives: ArchiveModel,
  gameView: GameViewModel,
): Disposable => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const follow = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const uri = getTabUri(window.tabGroups.activeTabGroup.activeTab);

      if (uri?.scheme === SCHEME && treeView.visible && isAutoRevealOn()) {
        void revealEntry(uri, treeView, archives, gameView, false).catch(() => undefined);
      }
    }, FOLLOW_DELAY);
  };

  const subscriptions = [
    window.tabGroups.onDidChangeTabs(({ changed, opened }) => {
      if ([...changed, ...opened].some((tab) => tab.isActive)) {
        follow();
      }
    }),
    window.tabGroups.onDidChangeTabGroups(follow),
    treeView.onDidChangeVisibility(({ visible }) => {
      if (visible) {
        follow();
      }
    }),
  ];

  return {
    dispose: () => {
      clearTimeout(timer);
      subscriptions.forEach((each) => each.dispose());
    },
  };
};
