export interface ClipChoice {
  id: string;
  label: string;
}

export interface ClipList {
  own: ClipChoice[];
  foreign?: ClipChoice[];
}

export interface ClipPicker {
  select: HTMLSelectElement;
  setList(list: ClipList): void;
  show(id: string | undefined): void;
  setHasSkeleton(hasSkeleton: boolean): void;
}

export const createClipPicker = (
  onPick: (id: string | undefined) => void,
): ClipPicker => {
  const select = document.createElement('select');
  const none = new Option('No skeleton', '');
  let hasChoices = false;
  let hasBones = false;

  select.title = 'Animation';
  select.append(none);
  select.disabled = true;
  select.onchange = () => onPick(select.value || undefined);

  const refresh = () => {
    none.textContent = hasBones || hasChoices ? 'Bind pose' : 'No skeleton';
    select.disabled = !hasBones && !hasChoices;
  };
  const toOption = ({ id, label }: ClipChoice) => new Option(label, id);

  return {
    select,
    setList: ({ own, foreign = [] }) => {
      const group = document.createElement('optgroup');
      const picked = select.value;

      group.label = 'Made for other skeletons';
      group.append(...foreign.map(toOption));
      select.replaceChildren(
        none,
        ...own.map(toOption),
        ...(foreign.length ? [group] : []),
      );
      select.value = picked;
      hasChoices = own.length + foreign.length > 0;
      refresh();
    },
    show: (id) => {
      select.value = id ?? '';
    },
    setHasSkeleton: (hasSkeleton) => {
      hasBones = hasSkeleton;
      refresh();
    },
  };
};
