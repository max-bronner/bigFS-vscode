import { element } from '../shared/element';
import type { CatalogueMessage, CatalogueRecordRow } from './protocol';

const PAGE_SIZE = 300;

interface Column {
  title: string;
  compare: (a: CatalogueRecordRow, b: CatalogueRecordRow) => number;
  render: (record: CatalogueRecordRow) => string;
  isNumeric?: boolean;
}

const COLUMNS: Column[] = [
  { title: 'Name', compare: (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()), render: (record) => record.name },
  { title: 'Kinds', compare: (a, b) => a.kinds.localeCompare(b.kinds), render: (record) => record.kinds },
  { title: 'Entries', compare: (a, b) => a.entries.length - b.entries.length, render: (record) => String(record.entries.length), isNumeric: true },
  { title: 'Bytes', compare: (a, b) => a.bytes - b.bytes, render: (record) => (record.bytes ? record.bytes.toLocaleString() : 'whole file'), isNumeric: true },
  { title: 'References', compare: (a, b) => a.references - b.references, render: (record) => String(record.references), isNumeric: true },
  { title: 'Source time', compare: (a, b) => a.modified - b.modified, render: (record) => new Date(record.modified).toISOString().slice(0, 19).replace('T', ' '), isNumeric: true },
];

export const renderCatalogueView = (
  root: HTMLElement,
  message: CatalogueMessage,
  onSync: () => void,
): void => {
  const sync = element('button', 'Sync with Assets…');
  const filter = element('input');
  const summary = element('span', '', 'muted');
  const table = element('table');
  const head = element('thead');
  const body = element('tbody');
  const more = element('button', 'Show more');
  let sortColumn = 0;
  let isDescending = false;
  let shown = PAGE_SIZE;
  const open = new Set<string>();

  sync.id = 'sync';
  sync.title = 'Compare this catalogue with the files the game loads';
  sync.addEventListener('click', onSync);
  filter.id = 'filter';
  filter.type = 'search';
  filter.placeholder = 'Filter by name, kind or entry';
  more.id = 'more';
  table.append(head, body);

  let visibleFor: string | undefined;
  let visibleRows: CatalogueRecordRow[] = [];

  const getVisible = (): CatalogueRecordRow[] => {
    const key = JSON.stringify([filter.value, sortColumn, isDescending]);

    if (key !== visibleFor) {
      visibleRows = filterAndSort();
      visibleFor = key;
    }
    return visibleRows;
  };

  const filterAndSort = (): CatalogueRecordRow[] => {
    const query = filter.value.trim().toLowerCase();
    const matching = query
      ? message.records.filter(
          (record) =>
            record.name.toLowerCase().includes(query) ||
            record.kinds.toLowerCase().includes(query) ||
            record.entries.some((entry) => entry.name.toLowerCase().includes(query)),
        )
      : [...message.records];
    const { compare } = COLUMNS[sortColumn];

    return matching.sort((a, b) => (isDescending ? -1 : 1) * compare(a, b) || a.name.localeCompare(b.name));
  };

  const renderHead = () => {
    const row = element('tr');

    COLUMNS.forEach((column, index) => {
      const cell = element(
        'th',
        `${column.title}${index === sortColumn ? (isDescending ? ' ▼' : ' ▲') : ''}`,
        column.isNumeric ? 'number' : undefined,
      );

      cell.title = `Sort by ${column.title.toLowerCase()}`;
      cell.addEventListener('click', () => {
        isDescending = index === sortColumn ? !isDescending : false;
        sortColumn = index;
        render();
      });
      row.append(cell);
    });
    head.replaceChildren(row);
  };

  const renderEntries = (record: CatalogueRecordRow): HTMLTableRowElement => {
    const row = element('tr', undefined, 'entries');
    const cell = element('td');
    const list = element('table');

    cell.colSpan = COLUMNS.length;
    for (const entry of record.entries) {
      const line = element('tr');

      line.append(
        element('td', entry.kind, 'kind'),
        element('td', entry.name),
        element('td', entry.size ? `${entry.offset.toLocaleString()} + ${entry.size.toLocaleString()}` : 'whole file', 'number'),
      );
      list.append(line);
    }
    cell.append(list);
    row.append(cell);

    return row;
  };

  const render = () => {
    const visible = getVisible();
    const rows: HTMLTableRowElement[] = [];

    for (const record of visible.slice(0, shown)) {
      const row = element('tr', undefined, 'record');

      COLUMNS.forEach((column) =>
        row.append(element('td', column.render(record), column.isNumeric ? 'number' : undefined)),
      );
      row.addEventListener('click', () => {
        if (open.delete(record.name)) {
          row.nextElementSibling?.remove();
        } else {
          open.add(record.name);
          row.after(renderEntries(record));
        }
      });
      rows.push(row);
      if (open.has(record.name)) {
        rows.push(renderEntries(record));
      }
    }

    renderHead();
    body.replaceChildren(...rows);
    summary.textContent = `${visible.length.toLocaleString()} of ${message.records.length.toLocaleString()} records, ${message.dependencies.toLocaleString()} dependency lists`;
    more.hidden = visible.length <= shown;
  };

  filter.addEventListener('input', () => {
    shown = PAGE_SIZE;
    render();
  });
  more.addEventListener('click', () => {
    shown += PAGE_SIZE;
    render();
  });

  const toolbar = element('div', undefined, 'toolbar');

  toolbar.append(sync, filter, summary);
  root.replaceChildren(element('h2', message.path), toolbar);

  if (message.error) {
    root.append(element('p', message.error, 'problem'));
    return;
  }

  root.append(table, more);
  render();
};
