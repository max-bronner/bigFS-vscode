import { groupStates } from '../../game/objects/groupStates';
import type { ListedState, StateGroup } from '../../game/objects/groupStates';
import type { ObjectScene } from '../../game/objects/objectScene';
import { element } from '../shared/element';
import { $ } from './page';
import { revealFold } from './revealFold';

const ADVANCED_GROUPS = new Set(['Model states', 'Transitions']);
const ADVANCED_FOLD = '\u0000advanced';
const LINKED_LOOKS = new Set(['Damage', 'Construction']);

const picker = {
  scene: undefined as ObjectScene | undefined,
  picked: undefined as number | undefined,
  onPick: (() => {}) as (state: number | undefined) => void,
};

const folds = new Map<string, boolean>();

const pick = (at: number | undefined) => {
  picker.picked = at;
  for (const row of $('objectStates').querySelectorAll<HTMLButtonElement>('button')) {
    row.setAttribute('aria-pressed', String(row.dataset.state === String(at ?? '')));
  }
  picker.onPick(at);
};

const createRow = (at: number | undefined, title: string, detail: string, hover: string) => {
  const row = element('button', undefined, 'state-row');

  row.dataset.state = String(at ?? '');
  row.setAttribute('aria-pressed', String(at === picker.picked));
  row.title = hover;
  row.append(element('span', title, 'state-title'));
  if (detail) {
    row.append(element('span', detail, 'state-detail'));
  }
  row.onclick = () => pick(at);
  return row;
};

const createStateRow = ({ at, state, title }: ListedState, showsDraw: boolean) => {
  const detail = [
    state.kind === 'model'
      ? state.model
      : state.animations.map((name) => name.slice(name.lastIndexOf('.') + 1)).join(', '),
    ...(showsDraw ? [state.draw] : []),
  ];

  return createRow(
    at,
    title,
    detail.filter(Boolean).join(' · '),
    [state.label, ...(state.name ? [`StateName = ${state.name}`] : []), state.draw].join('\n'),
  );
};

const createLookLink = (title: string) => {
  const findFold = () =>
    document.querySelector<HTMLDetailsElement>(`#objectAppearance details[data-look="${title}"]`);

  if (!LINKED_LOOKS.has(title) || !findFold()) {
    return [];
  }

  const link = element('button', 'see Appearance', 'see-also');

  link.title = `The ${title.toLowerCase()} looks are set in Appearance; a state picked here sets its look there`;
  link.onclick = (event) => {
    event.preventDefault();

    const fold = findFold();

    if (fold) {
      revealFold(fold);
    }
  };
  return [link];
};

const createGroup = ({ title, states }: StateGroup, query: string, showsDraw: boolean) => {
  const group = element('details', undefined, 'state-group');
  const summary = element('summary', title);

  group.dataset.group = title;
  group.open = !!query || (folds.get(title) ?? states.some(({ at }) => at === picker.picked));
  summary.append(element('span', ` ${states.length}`, 'muted'), ...createLookLink(title));
  summary.onclick = () => {
    folds.set(title, !group.open);
  };
  group.append(summary, ...states.map((state) => createStateRow(state, showsDraw)));
  return group;
};

const render = () => {
  const { scene } = picker;

  if (!scene) {
    return;
  }

  const query = $<HTMLInputElement>('objectStateFilter').value.trim();
  const groups = groupStates(scene.states, query, new Set(scene.upgrades.flatMap((upgrade) => upgrade.raisesTemporarily ?? [])));
  const showsDraw = new Set(scene.states.map((state) => state.draw)).size > 1;
  const advanced = groups.filter(({ title }) => ADVANCED_GROUPS.has(title));
  const advancedFold = element('details', undefined, 'state-advanced');
  const advancedSummary = element('summary', 'Advanced ');

  advancedSummary.append(
    element('span', advanced.map(({ title, states }) => `${title.toLowerCase()} ${states.length}`).join(', '), 'muted'),
  );
  advancedSummary.onclick = () => {
    folds.set(ADVANCED_FOLD, !advancedFold.open);
  };
  advancedFold.title =
    "Every model state as the INI writes it, and the transitions between states: for checking a draw module's states one by one";
  advancedFold.open =
    !!query ||
    (folds.get(ADVANCED_FOLD) ??
      advanced.some(({ states }) => states.some(({ at }) => at === picker.picked)));
  advancedFold.append(
    advancedSummary,
    ...advanced.map((group) => createGroup(group, query, showsDraw)),
  );
  $('objectStatesCount').textContent = String(scene.states.length);
  $('objectStates').replaceChildren(
    ...(query
      ? []
      : [
          createRow(
            undefined,
            'The object as a whole',
            'idles, and follows Appearance',
            'The object as it stands: its idle animation, and the model Appearance selects',
          ),
        ]),
    ...groups
      .filter((group) => !advanced.includes(group))
      .map((group) => createGroup(group, query, showsDraw)),
    ...(advanced.length ? [advancedFold] : []),
    ...(groups.length ? [] : [element('div', 'No state matches', 'muted')]),
  );
};

export const showStates = (
  scene: ObjectScene,
  picked: number | undefined,
  onPick: (state: number | undefined) => void,
  revealsPicked = false,
): void => {
  if (picker.scene?.name !== scene.name) {
    folds.clear();
  }
  picker.scene = scene;
  picker.picked = picked;
  picker.onPick = onPick;
  $('objectStateFilter').oninput = render;
  render();
  if (revealsPicked && picked !== undefined) {
    $('objectStates').querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }
};
