import { element } from '../shared/element';
import { getVsCodeApi } from '../shared/vscodeApi';
import type { ConverterKind, FromConvertersPage, ListedFile, ToConvertersPage } from './protocol';

const vscode = getVsCodeApi<FromConvertersPage>();

interface Card {
  files: ListedFile[];
  render(): void;
  note: HTMLElement;
}

const cards = new Map<ConverterKind, Card>();

const getFolderPath = (uri: string): string => {
  const path = decodeURIComponent(uri.replace(/^[a-z-]+:\/\/[^/]*/i, ''));
  const folder = path.slice(0, path.lastIndexOf('/'));

  return uri.startsWith('file:') ? folder.replace(/^\/(?=[a-z]:)/i, '').replace(/\//g, '\\') : folder;
};

const createCard = (converter: ConverterKind, title: string, about: string): HTMLElement => {
  const section = element('section', undefined, 'card');
  const box = element('div', undefined, 'files-box');
  const list = element('ul', undefined, 'files');
  const empty = element('p', 'No files', 'empty');
  const removeAll = element('button', 'Remove all', 'link');
  const addFiles = element('button', 'Add files…', 'secondary');
  const convert = element('button', 'Convert…');
  const actions = element('div', undefined, 'actions');
  const note = element('p', undefined, 'note');
  const card: Card = {
    files: [],
    note,
    render: () => {
      list.replaceChildren(
        ...card.files.map((file) => {
          const row = element('li');
          const remove = element('button', '×', 'remove');
          const folder = getFolderPath(file.uri);

          remove.title = `Remove ${file.name}`;
          remove.onclick = () => {
            card.files = card.files.filter((each) => each.uri !== file.uri);
            note.textContent = '';
            card.render();
          };
          row.title = `${folder}${folder.includes('\\') ? '\\' : '/'}${file.name}`;
          row.append(element('span', file.name, 'name'), element('span', folder, 'folder'), remove);
          return row;
        }),
      );
      box.classList.toggle('empty', card.files.length === 0);
      list.hidden = removeAll.hidden = card.files.length === 0;
      empty.hidden = card.files.length > 0;
      convert.disabled = card.files.length === 0;
      convert.textContent = card.files.length > 1 ? `Convert ${card.files.length} files…` : 'Convert…';
      vscode.postMessage({ kind: 'listed', converter, uris: card.files.map(({ uri }) => uri) });
    },
  };

  removeAll.onclick = () => {
    card.files = [];
    note.textContent = '';
    card.render();
  };
  addFiles.onclick = () => vscode.postMessage({ kind: 'pick', converter });
  convert.onclick = () =>
    vscode.postMessage({ kind: 'convert', converter, uris: card.files.map(({ uri }) => uri) });
  box.append(empty, list);
  actions.append(addFiles, convert);
  section.append(element('h3', title), element('p', about, 'about'), box, removeAll, actions, note);
  cards.set(converter, card);
  card.render();
  return section;
};

document.body.append(
  createCard(
    'image',
    'Image to game texture',
    'PNG, JPEG, BMP, GIF, WebP, TGA or DDS to the TGA or DDS the game reads.',
  ),
  createCard('cursor', 'Cursor', 'PNG images to .cur cursors, with the pixel that points.'),
  createCard('video', 'Movie to VP6', 'Videos or numbered frames to the VP6 movie the game plays.'),
  createCard('strings', 'String table', 'A .str to .csf, or a .csf to .str.'),
);

window.addEventListener('message', ({ data }: MessageEvent<ToConvertersPage>) => {
  const card = data.kind === 'add' ? cards.get(data.converter) : undefined;

  if (!card) {
    return;
  }

  const listed = new Set(card.files.map(({ uri }) => uri));
  const added = data.files.filter(({ uri }) => !listed.has(uri) && listed.add(uri));

  card.files = [...card.files, ...added];
  card.note.textContent = data.skipped.length
    ? `Skipped, not taken here: ${data.skipped.slice(0, 5).join(', ')}${data.skipped.length > 5 ? ` and ${data.skipped.length - 5} more` : ''}`
    : '';
  card.render();
});

vscode.postMessage({ kind: 'ready' });
