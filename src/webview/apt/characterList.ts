import {
  CHARACTER_KINDS,
  KIND_TITLES,
  listCharacterRows,
  matchesFilter,
} from './characterGroups';
import type { CharacterKind, CharacterRow } from './characterGroups';
import { describeCharacter } from './describeCharacter';
import { byId } from './dom';
import { resolve } from './resolve';
import { movie, state } from './state';

const list = byId('list');
const filter = byId<HTMLInputElement>('filter');
const kinds = byId('kinds');

let shownKind: CharacterKind | undefined;
let onSelect: (id: number) => void = () => {};

const createChip = (label: string, count: number, kind: CharacterKind | undefined) => {
  const chip = document.createElement('button');
  const number = document.createElement('span');

  chip.className = 'chip';
  chip.setAttribute('aria-pressed', String(kind === shownKind));
  number.className = 'count';
  number.textContent = String(count);
  chip.append(label, number);
  chip.onclick = () => {
    shownKind = kind;
    showList();
  };
  return chip;
};

const createRow = (row: CharacterRow) => {
  const character = movie().characters[row.id];
  const element = document.createElement('div');
  const id = document.createElement('span');
  const name = document.createElement('span');
  const detail = document.createElement('span');

  element.className = 'row' + (row.id === state.selected ? ' selected' : '');
  element.dataset.id = String(row.id);
  element.title = describeCharacter(character);
  id.className = 'row-id';
  id.textContent = `#${row.id}`;
  name.className = 'row-name';
  name.textContent = row.name;
  detail.className = 'row-detail';
  detail.textContent = row.detail;
  element.append(id, name, detail);
  element.onclick = () => onSelect(row.id);
  element.draggable = character.type !== 'movie';
  element.ondragstart = (event) =>
    event.dataTransfer?.setData('application/x-apt-character', String(row.id));
  return element;
};

export const onCharacterSelect = (select: (id: number) => void): void => {
  onSelect = select;
};

export const showList = (): void => {
  const source = movie();
  const rows = listCharacterRows(source, (id) => !!resolve(source, id));
  const matching = rows.filter((row) => matchesFilter(row, filter.value.trim()));
  const present = CHARACTER_KINDS.filter((kind) => rows.some((row) => row.kind === kind));

  if (shownKind && !present.includes(shownKind)) {
    shownKind = undefined;
  }
  kinds.replaceChildren(
    createChip('All', matching.length, undefined),
    ...present.map((kind) =>
      createChip(
        KIND_TITLES[kind],
        matching.filter((row) => row.kind === kind).length,
        kind,
      ),
    ),
  );
  list.replaceChildren(
    ...present
      .filter((kind) => !shownKind || kind === shownKind)
      .flatMap((kind) => {
        const inKind = matching.filter((row) => row.kind === kind);
        const heading = document.createElement('div');

        heading.className = 'group';
        heading.textContent = KIND_TITLES[kind];
        return inKind.length ? [heading, ...inKind.map(createRow)] : [];
      }),
  );
};

export const markSelected = (): void =>
  list
    .querySelectorAll<HTMLElement>('.row')
    .forEach((each) =>
      each.classList.toggle('selected', Number(each.dataset.id) === state.selected),
    );

filter.addEventListener('input', showList);
