import { element } from '../shared/element';
import type { SyncGroup, SyncMessage, SyncResultMessage, SyncRow } from './protocol';

const ROWS_SHOWN = 500;

const GROUPS: { group: SyncGroup; title: string; action: string }[] = [
  { group: 'missing', title: 'Missing from asset.dat', action: 'A record is added for each file, read from the file.' },
  { group: 'stale', title: 'Out of date', action: 'Each record is written again from its file as it is now.' },
  { group: 'gone', title: 'File gone', action: 'Each record is removed; no file of the game answers it.' },
];

const setTriState = (box: HTMLInputElement, selected: number, total: number) => {
  box.checked = total > 0 && selected === total;
  box.indeterminate = selected > 0 && selected < total;
  box.disabled = total === 0;
};

export interface SyncView {
  showResult(result: SyncResultMessage): void;
}

export const renderSyncView = (
  root: HTMLElement,
  message: SyncMessage,
  onApply: (selected: Record<SyncGroup, string[]>) => void,
  onOpen: (group: SyncGroup, id: string) => void,
): SyncView => {
  const selected: Record<SyncGroup, Set<string>> = {
    missing: new Set(),
    gone: new Set(),
    stale: new Set(),
  };
  const total = GROUPS.reduce((sum, { group }) => sum + message.groups[group].length, 0);
  const everything = element('input');
  const everythingLabel = element('label');
  const apply = element('button', 'Apply');
  const status = element('p', '', 'status');
  const refreshers: (() => void)[] = [];

  const countSelected = () =>
    GROUPS.reduce((sum, { group }) => sum + selected[group].size, 0);
  const refresh = () => {
    const count = countSelected();

    setTriState(everything, count, total);
    apply.disabled = count === 0;
    apply.textContent = count ? `Apply ${count.toLocaleString()} change${count === 1 ? '' : 's'}` : 'Apply';
    refreshers.forEach((refreshGroup) => refreshGroup());
  };

  everything.type = 'checkbox';
  everything.id = 'select-all';
  everything.addEventListener('change', () => {
    for (const { group } of GROUPS) {
      const ids = message.groups[group].map((row) => row.id);

      selected[group] = new Set(everything.checked ? ids : []);
    }
    refresh();
  });
  everythingLabel.append(everything, ` Everything (${total.toLocaleString()})`);
  apply.id = 'apply';
  apply.addEventListener('click', () => {
    apply.disabled = true;
    status.textContent = 'Applying…';
    onApply({
      missing: [...selected.missing],
      gone: [...selected.gone],
      stale: [...selected.stale],
    });
  });

  const renderGroup = ({ group, title, action }: (typeof GROUPS)[number]): HTMLElement => {
    const rows = message.groups[group];
    const section = element('details', undefined, 'group');
    const summary = element('summary');
    const box = element('input');
    const count = element('span', '', 'muted');
    const list = element('div', undefined, 'rows');
    const boxes = new Map<string, HTMLInputElement>();
    let limit = ROWS_SHOWN;

    section.id = `group-${group}`;
    section.open = rows.length > 0;
    box.type = 'checkbox';
    box.id = `select-${group}`;
    box.addEventListener('click', (event) => event.stopPropagation());
    box.addEventListener('change', () => {
      selected[group] = new Set(box.checked ? rows.map((row) => row.id) : []);
      refresh();
    });
    summary.append(box, ` ${title} `, count);

    const renderRow = (row: SyncRow): HTMLElement => {
      const label = element('label', undefined, 'row');
      const rowBox = element('input');

      rowBox.type = 'checkbox';
      rowBox.dataset.id = row.id;
      rowBox.addEventListener('change', () => {
        if (rowBox.checked) {
          selected[group].add(row.id);
        } else {
          selected[group].delete(row.id);
        }
        refresh();
      });
      boxes.set(row.id, rowBox);
      const name = element('span', row.name, 'name');

      if (row.path) {
        name.classList.add('link');
        name.title = 'Ctrl+click (Cmd+click on macOS) to open the file';
        name.addEventListener('click', (event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            onOpen(group, row.id);
          }
        });
      }
      label.append(rowBox, name);
      if (row.path) {
        label.append(element('span', row.path, 'path'));
      }
      if (row.origin) {
        label.append(element('span', row.origin, 'muted'));
      }

      return label;
    };

    const renderRows = () => {
      boxes.clear();
      list.replaceChildren(...rows.slice(0, limit).map(renderRow));

      if (rows.length > limit) {
        const all = element('button', `Show all ${rows.length.toLocaleString()}`);

        all.addEventListener('click', () => {
          limit = rows.length;
          renderRows();
          refresh();
        });
        list.append(all);
      }
    };

    refreshers.push(() => {
      setTriState(box, selected[group].size, rows.length);
      count.textContent = `${selected[group].size.toLocaleString()} of ${rows.length.toLocaleString()} selected`;
      for (const [id, rowBox] of boxes) {
        rowBox.checked = selected[group].has(id);
      }
    });

    renderRows();
    section.append(
      summary,
      element('p', rows.length ? action : 'None found.', 'muted'),
      list,
    );

    return section;
  };

  const toolbar = element('div', undefined, 'toolbar');

  toolbar.append(everythingLabel, apply);
  root.replaceChildren(
    element('h2', `Sync ${message.catalogue}`),
    element('p', `Compared with the files the game loads. Apply writes ${message.target}.`, 'muted'),
    toolbar,
    status,
    ...GROUPS.map(renderGroup),
  );
  refresh();

  return {
    showResult: ({ kind, text }) => {
      status.textContent = text;
      status.className = kind === 'failed' ? 'status problem' : 'status';
      apply.disabled = kind === 'applied' || countSelected() === 0;
    },
  };
};
