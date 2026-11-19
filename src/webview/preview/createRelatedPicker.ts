import type {
  RelatedModel,
  RelatedModelKind,
} from '../../game/objects/findRelatedModels';

export interface RelatedPicker {
  select: HTMLSelectElement;
  setList(openedFile: string, files: RelatedModel[]): void;
  show(file: string | undefined): void;
}

const GROUPS: [RelatedModelKind, string][] = [
  ['model', 'Models'],
  ['skeleton', 'Skeleton'],
  ['animation', 'Animations'],
];

const withoutExtension = (file: string) => file.replace(/\.w3d$/i, '');

export const labelRelatedModel = ({ file, uses }: RelatedModel): string =>
  uses[0]
    ? `${withoutExtension(file)} · ${uses[0].object}: ${uses[0].state}${uses.length > 1 ? ` +${uses.length - 1}` : ''}`
    : withoutExtension(file);

export const createRelatedPicker = (
  onPick: (entry: RelatedModel | undefined) => void,
): RelatedPicker => {
  const select = document.createElement('select');
  let entries = new Map<string, RelatedModel>();

  select.title = 'Related W3D files: the states, skins, skeleton and animations that belong with this one';
  select.hidden = true;
  select.style.maxWidth = '24em';
  select.onchange = () => onPick(entries.get(select.value));

  return {
    select,
    setList: (openedFile, files) => {
      const opened = new Option(`${withoutExtension(openedFile)} (this file)`, '');

      entries = new Map(files.map((entry) => [entry.file, entry]));
      select.replaceChildren(
        opened,
        ...GROUPS.flatMap(([kind, label]) => {
          const members = files.filter((entry) => entry.kind === kind);
          const group = document.createElement('optgroup');

          group.label = label;
          group.append(
            ...members.map((entry) => {
              const option = new Option(labelRelatedModel(entry), entry.file);

              option.title = entry.uses
                .map((use) => `${use.object}: ${use.state}`)
                .join('\n');
              return option;
            }),
          );
          return members.length ? [group] : [];
        }),
      );
      select.hidden = !files.length;
    },
    show: (file) => {
      select.value = file ?? '';
    },
  };
};
