import { resolveShownArmor } from '../../game/objects/armorTable';
import type { ArmorRow } from '../../game/objects/armorTable';
import { captureFocus } from '../shared/captureFocus';
import type { ArmorTableMessage, FromArmorPage } from './protocol';
import { getVsCodeApi } from '../shared/vscodeApi';

const vscode = getVsCodeApi<FromArmorPage>();
const table = document.getElementById('table') as HTMLTableElement;
const filter = document.getElementById('filter') as HTMLInputElement;
const summary = document.getElementById('summary')!;
let data: ArmorTableMessage | undefined;

const parsePercent = (value: string | undefined) =>
  value === undefined ? undefined : Number(value.replace('%', ''));

const showCell = (
  cell: HTMLTableCellElement,
  input: HTMLInputElement,
  row: ArmorRow,
  type: string,
): void => {
  const { value: shown, inherited } = resolveShownArmor(row, type);
  const value = parsePercent(shown);

  if (input !== document.activeElement) {
    input.value = shown;
  }
  input.className = inherited ? 'inherited' : '';
  input.title = inherited
    ? row.cells.DEFAULT
      ? `From DEFAULT; typing writes ${type} for ${row.name}`
      : `The game's 100% for a type with no line; typing writes ${type} for ${row.name}`
    : `${row.name} against ${type}`;
  cell.className =
    value === undefined
      ? ''
      : value < 100
        ? 'low'
        : value > 100
          ? 'high'
          : '';
};

const shapeOf = (rows: ArmorRow[], types: string[]): string =>
  JSON.stringify([types, rows.map((row) => row.name)]);

let shownShape: string | undefined;

const createRow = (row: ArmorRow, types: string[]): HTMLTableRowElement => {
  const line = document.createElement('tr');
  const name = document.createElement('td');

  name.className = 'name';
  name.textContent = row.name;
  name.title = 'Show it in its file';
  name.onclick = () => vscode.postMessage({ kind: 'reveal', armor: row.name });
  line.append(
    name,
    ...types.map((type) => {
      const cell = document.createElement('td');
      const input = document.createElement('input');

      input.onchange = () =>
        vscode.postMessage({
          kind: 'set',
          armor: row.name,
          type,
          value: input.value,
        });
      showCell(cell, input, row, type);
      cell.append(input);
      return cell;
    }),
  );
  return line;
};

const patchRows = (rows: ArmorRow[], types: string[]): void => {
  const lines = table.querySelectorAll('tr:not(:first-child)');

  rows.forEach((row, at) => {
    lines[at].querySelectorAll('td:not(.name)').forEach((cell, column) => {
      showCell(
        cell as HTMLTableCellElement,
        cell.firstElementChild as HTMLInputElement,
        row,
        types[column],
      );
    });
  });
};

const render = () => {
  if (!data) {
    return;
  }

  const needle = filter.value.toLowerCase();
  const rows = data.rows.filter((row) =>
    row.name.toLowerCase().includes(needle),
  );
  const shape = shapeOf(rows, data.types);

  if (shape === shownShape) {
    patchRows(rows, data.types);
  } else {
    const types = data.types;
    const head = document.createElement('tr');
    const restoreFocus = captureFocus(table);

    head.append(
      ...['Armor', ...types].map((text) => {
        const cell = document.createElement('th');

        cell.textContent = text;
        return cell;
      }),
    );
    table.replaceChildren(head, ...rows.map((row) => createRow(row, types)));
    restoreFocus();
    shownShape = shape;
  }
  summary.textContent = `${rows.length} of ${data.rows.length} armors, ${data.types.length} damage types`;
};

filter.oninput = render;
window.addEventListener(
  'message',
  ({ data: message }: MessageEvent<ArmorTableMessage>) => {
    if (message.kind === 'table') {
      data = message;
      render();
    }
  },
);
vscode.postMessage({ kind: 'ready' });
