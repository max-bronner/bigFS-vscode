import { byId } from './dom';

export type SideTab = 'details' | 'inspector' | 'engine';

const TABS: SideTab[] = ['details', 'inspector', 'engine'];

const tabOf = (name: SideTab) => byId<HTMLButtonElement>(`tab-${name}`);
const panelOf = (name: SideTab) => byId(tabOf(name).getAttribute('aria-controls')!);

let shown: SideTab = 'details';

export const getSideTab = (): SideTab => shown;

export const showSideTab = (name: SideTab, focus = false): void => {
  shown = name;
  for (const each of TABS) {
    const tab = tabOf(each);
    const isShown = each === name;

    tab.setAttribute('aria-selected', String(isShown));
    tab.tabIndex = isShown ? 0 : -1;
    panelOf(each).hidden = !isShown;
  }
  if (focus) {
    tabOf(name).focus();
  }
};

for (const name of TABS) {
  tabOf(name).addEventListener('click', () => showSideTab(name));
}
byId('tab-details').parentElement!.addEventListener('keydown', (event) => {
  const at = TABS.indexOf(shown);
  const next: Record<string, number> = {
    ArrowRight: (at + 1) % TABS.length,
    ArrowLeft: (at - 1 + TABS.length) % TABS.length,
    Home: 0,
    End: TABS.length - 1,
  };

  if (event.key in next) {
    event.preventDefault();
    event.stopPropagation();
    showSideTab(TABS[next[event.key]], true);
  }
});
