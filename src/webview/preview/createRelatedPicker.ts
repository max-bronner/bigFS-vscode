import type {
  RelatedModel,
  RelatedModelKind,
} from '../../game/objects/findRelatedModels';
import { element } from '../shared/element';
import { createSideRow } from './createSideRow';

export interface RelatedPicker {
  list: HTMLElement;
  setList(openedFile: string, files: RelatedModel[]): void;
  show(file: string | undefined): void;
}

export type RelatedLine =
  | { kind: 'heading'; text: string }
  | {
      kind: 'file';
      entry?: RelatedModel;
      name: string;
      detail?: string;
      title?: string;
      isPicked: boolean;
    }
  | { kind: 'more'; group: RelatedModelKind; hidden: number };

const GROUPS: [RelatedModelKind, string][] = [
  ['model', 'Models'],
  ['skeleton', 'Skeleton'],
  ['animation', 'Animations'],
];

const ROWS_SHOWN = 10;

const withoutExtension = (file: string) => file.replace(/\.w3d$/i, '');

const shortenState = (state: string) => state.replace(/^[^=]*=\s*/, '');

export const layOutRelatedList = (
  openedFile: string,
  files: readonly RelatedModel[],
  picked: string | undefined,
  expanded: ReadonlySet<RelatedModelKind>,
): RelatedLine[] => [
  {
    kind: 'file',
    name: withoutExtension(openedFile),
    detail: 'this file',
    isPicked: picked === undefined,
  },
  ...GROUPS.flatMap(([group, label]): RelatedLine[] => {
    const members = files.filter((entry) => entry.kind === group);
    const isWhole =
      expanded.has(group) ||
      members.length <= ROWS_SHOWN ||
      members.findIndex((entry) => entry.file === picked) >= ROWS_SHOWN;
    const shown = isWhole ? members : members.slice(0, ROWS_SHOWN);

    if (!members.length) {
      return [];
    }
    return [
      { kind: 'heading', text: `${label} (${members.length})` },
      ...shown.map(
        (entry): RelatedLine => ({
          kind: 'file',
          entry,
          name: withoutExtension(entry.file),
          detail: entry.uses[0]
            ? `${entry.uses[0].object}: ${shortenState(entry.uses[0].state)}${entry.uses.length > 1 ? ` +${entry.uses.length - 1}` : ''}`
            : undefined,
          title: entry.uses.map((use) => `${use.object}: ${use.state}`).join('\n') || undefined,
          isPicked: entry.file === picked,
        }),
      ),
      ...(isWhole
        ? []
        : [{ kind: 'more' as const, group, hidden: members.length - ROWS_SHOWN }]),
    ];
  }),
];

export const createRelatedPicker = (
  onPick: (entry: RelatedModel | undefined) => void,
): RelatedPicker => {
  const list = element('div', undefined, 'side-list');
  const expanded = new Set<RelatedModelKind>();
  let opened = '';
  let files: RelatedModel[] = [];
  let picked: string | undefined;

  list.title = 'Related W3D files: the states, skins, skeleton and animations that belong with this one';

  const render = () => {
    list.replaceChildren(
      ...layOutRelatedList(opened, files, picked, expanded).map((line) => {
        if (line.kind === 'heading') {
          return element('div', line.text, 'side-group');
        }
        if (line.kind === 'more') {
          const more = element('button', `Show all, ${line.hidden} more`, 'side-more');

          more.onclick = () => {
            expanded.add(line.group);
            render();
          };
          return more;
        }

        const { entry } = line;
        const row = createSideRow(line.name, line.detail, () => {
          if (line.isPicked && entry?.kind !== 'animation') {
            return;
          }
          picked = entry?.file;
          render();
          onPick(entry);
        });

        row.setAttribute('aria-pressed', String(line.isPicked));
        if (line.title) {
          row.title = line.title;
        }
        return row;
      }),
    );
  };

  return {
    list,
    setList: (openedFile, next) => {
      opened = openedFile;
      files = next;
      render();
    },
    show: (file) => {
      picked = file;
      render();
    },
  };
};
