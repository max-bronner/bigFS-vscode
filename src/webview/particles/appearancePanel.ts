import { listAppearanceControls, switchUpgrade } from '../../game/objects/appearanceControls';
import {
  applyPicks,
  createPicks,
  findStep,
  getChoice,
  listNextChoices,
} from '../../game/objects/appearancePicks';
import type { AppearancePicks } from '../../game/objects/appearancePicks';
import { listSourcesOf } from '../../game/objects/partBindings';
import type { AppearanceChange } from '../../game/objects/partBindings';
import { walkUpgrades } from '../../game/objects/walkUpgrades';
import type {
  AppearanceControls,
  AppearanceStep,
  ConditionStep,
} from '../../game/objects/appearanceControls';
import { listAppearanceOptions } from '../../game/objects/objectAppearance';
import type {
  AppearanceChoice,
  AppearanceOptions,
} from '../../game/objects/objectAppearance';
import { readStateConditions } from '../../game/objects/objectScene';
import type { ObjectScene, SceneState } from '../../game/objects/objectScene';
import { applyStatePick } from '../../game/objects/statePicks';
import { element } from '../shared/element';
import type { LookChip } from './lookChips';
import { $ } from './page';
import { revealFold } from './revealFold';

const PLAYED_LOOKS = new Set(['Damage', 'Construction']);

const panel = {
  scene: undefined as ObjectScene | undefined,
  composed: undefined as AppearanceOptions | undefined,
  controls: undefined as AppearanceControls | undefined,
  picks: createPicks(),
  onChange: () => {},
  isFollowing: true,
  syncs: [] as (() => void)[],
  looks: [] as { title: string; getValue: () => string; isChanged: () => boolean; fold: HTMLDetailsElement }[],
};

const folds = new Map<string, boolean>();

export const getAppearance = (): AppearanceChoice => getChoice(panel.controls, panel.picks);

export const listNearbyAppearances = (): AppearanceChoice[] =>
  panel.controls ? listNextChoices(panel.controls, panel.picks) : [];

export const isFollowingAppearance = (): boolean => panel.isFollowing;

export const listChangedLooks = (): LookChip[] =>
  panel.looks
    .filter((look) => look.isChanged())
    .map(({ title, getValue, fold }) => ({ title, value: getValue(), fold }));

export const followAppearance = (): void => {
  panel.isFollowing = true;
};

const sync = () => {
  panel.syncs.forEach((update) => update());

  const { picks } = panel;

  $<HTMLButtonElement>('objectAppearanceReset').disabled =
    !picks.isSnowy &&
    !picks.upgrades.length &&
    !picks.sides.size &&
    !picks.forms.size &&
    picks.randomTexture === undefined &&
    ![picks.faction, picks.level, picks.damage, picks.construction, picks.variation].some(Boolean);
};

const change = (edit: (picks: AppearancePicks) => void) => {
  panel.isFollowing = true;
  edit(panel.picks);
  sync();
  panel.onChange();
};

export const pickAppearance = (changes: readonly AppearanceChange[]): boolean => {
  const { controls, picks } = panel;

  if (!controls) {
    return false;
  }

  const before = JSON.stringify(getAppearance());

  changes.forEach((each) => applyPicks(controls, picks, each));
  sync();
  return before !== JSON.stringify(getAppearance());
};

export const pickStateLook = (state: SceneState): { actions: string[]; isChanged: boolean } => {
  const { controls, picks, scene } = panel;

  if (!controls || !scene) {
    return { actions: readStateConditions(state).filter((each) => each !== 'NONE'), isChanged: false };
  }

  const before = JSON.stringify(getAppearance());
  const actions = applyStatePick(scene, controls, picks, state);

  sync();
  return { actions, isChanged: before !== JSON.stringify(getAppearance()) };
};

export const changeBoundAppearance = (changes: readonly AppearanceChange[]): void => {
  if (pickAppearance(changes)) {
    panel.isFollowing = false;
    panel.onChange();
  }
};

const createInput = (
  type: 'radio' | 'checkbox',
  text: string,
  hover: string,
  isOn: () => boolean,
  onInput: (on: boolean) => void,
) => {
  const row = element('label', undefined, 'appearance-option');
  const input = element('input');

  input.type = type;
  input.onchange = () => onInput(input.checked);
  panel.syncs.push(() => {
    input.checked = isOn();
  });
  row.title = hover;
  row.append(input, element('span', text));
  return { row, input };
};

const createStatesLink = (title: string) => {
  const link = element('button', 'see states', 'see-also');

  link.title = `The animations of ${title.toLowerCase()} in State and animation; picking one sets its look here`;
  link.onclick = (event) => {
    event.preventDefault();

    const group = document.querySelector<HTMLDetailsElement>(
      `#objectStates details[data-group="${title}"]`,
    );

    revealFold(group ?? $<HTMLDetailsElement>('objectStatesSection'));
  };
  return link;
};

const createFold = (
  title: string,
  getValue: () => string,
  opensAtFirst: boolean,
  rows: HTMLElement[],
  isChanged: () => boolean,
) => {
  const fold = element('details', undefined, 'appearance-group');
  const summary = element('summary', title);
  const value = element('span', '', 'appearance-value');

  fold.open = folds.get(title) ?? opensAtFirst;
  fold.dataset.look = title;
  summary.onclick = () => {
    folds.set(title, !fold.open);
  };
  panel.syncs.push(() => {
    value.textContent = getValue();
  });
  panel.looks.push({ title, getValue, isChanged, fold });
  if (PLAYED_LOOKS.has(title)) {
    summary.append(createStatesLink(title));
  }
  summary.append(value);
  fold.append(summary, ...rows);
  return fold;
};

const createRadios = (
  key: 'faction' | 'level' | 'damage' | 'construction' | 'variation',
  steps: readonly AppearanceStep[],
) =>
  steps.map((step, at) => {
    const { row, input } = createInput(
      'radio',
      step.title,
      step.names.join('\n'),
      () => findStep(steps, panel.picks[key]) === step,
      () =>
        change((picks) => {
          picks[key] = at ? step.title : '';
        }),
    );

    input.name = `appearance-${key}`;
    if (step.note) {
      row.lastElementChild!.append(element('span', step.note, 'appearance-note'));
    }
    return row;
  });

const getStepTitle = (steps: readonly AppearanceStep[], title: string) =>
  findStep(steps, title)?.title ?? '';

const createChecks = (key: 'sides' | 'forms', steps: readonly ConditionStep[]) =>
  steps.map((step) => {
    const { row } = createInput(
      'checkbox',
      step.isIniName ? step.names.join(' ') : step.title,
      step.isIniName
        ? `${step.names.join(' ')}: the INI's name; what it means is up to the object's scripts and upgrades`
        : step.names.join('\n'),
      () => panel.picks[key].has(step.title),
      (on) =>
        change((picks) => {
          if (on) {
            picks[key].add(step.title);
          } else {
            picks[key].delete(step.title);
          }
        }),
    );

    if (step.isIniName) {
      row.lastElementChild!.className = 'ini-name';
    }
    return row;
  });

const createUpgradeRows = ({ upgrades }: AppearanceControls) =>
  upgrades.map(({ name, title, fullTitle, isHeld, needs }) => {
    const { row, input } = createInput(
      'checkbox',
      title,
      [fullTitle, name, ...needs.map((need) => `needs ${need}`)].join('\n'),
      () =>
        isHeld ||
        walkUpgrades(panel.scene!, getAppearance().upgrades).active.has(name.toLowerCase()),
      (on) =>
        change((picks) => {
          for (const each of on ? [name] : listSourcesOf(panel.scene!, name)) {
            picks.upgrades = switchUpgrade(upgrades, picks.upgrades, each, on);
          }
        }),
    );
    const notes = [
      ...(isHeld ? ['from creation'] : []),
      ...needs.map(
        (need) => `needs ${upgrades.find((each) => each.name === need)?.title ?? need}`,
      ),
    ];

    input.disabled = isHeld;
    if (notes.length) {
      row.lastElementChild!.append(element('span', notes.join(', '), 'appearance-note'));
    }
    return row;
  });

const createRandomFold = (count: number) => {
  const select = element('select');

  select.id = 'objectRandomTexture';
  select.append(
    new Option("The model's own", ''),
    ...Array.from({ length: count }, (_, at) => new Option(`Skin ${at + 1}`, String(at))),
  );
  select.onchange = () =>
    change((picks) => {
      picks.randomTexture = select.value === '' ? undefined : Number(select.value);
    });
  panel.syncs.push(() => {
    select.value = String(panel.picks.randomTexture ?? '');
  });
  return createFold(
    'Random skin',
    () =>
      panel.picks.randomTexture === undefined
        ? "the model's own"
        : `skin ${panel.picks.randomTexture + 1}`,
    true,
    [select],
    () => panel.picks.randomTexture !== undefined,
  );
};

const countPicked = (count: number) => (count ? `${count} on` : 'none');

const render = () => {
  const { scene } = panel;

  if (!scene) {
    return;
  }

  const controls = listAppearanceControls(scene, panel.composed ?? listAppearanceOptions([scene]));
  const { factions, levels, upgrades, damage, brokenSides, construction, variations, forms } =
    controls;
  const { picks } = panel;
  const groups: HTMLElement[] = [];

  panel.controls = controls;
  panel.syncs = [];
  panel.looks = [];
  if (controls.canSnow) {
    const weather = [
      { title: 'Normal', snowy: false },
      { title: 'Snow', snowy: true },
    ].map(({ title, snowy }) => {
      const { row, input } = createInput(
        'radio',
        title,
        snowy ? 'A snowy map: every object holds SNOW' : '',
        () => picks.isSnowy === snowy,
        () =>
          change((next) => {
            next.isSnowy = snowy;
          }),
      );

      input.name = 'appearance-weather';
      return row;
    });

    groups.push(
      createFold('Weather', () => (picks.isSnowy ? 'Snow' : 'Normal'), true, weather, () => picks.isSnowy),
    );
  }
  if (factions.length) {
    groups.push(
      createFold(
        'Faction',
        () => getStepTitle(factions, picks.faction),
        false,
        createRadios('faction', factions),
        () => !!picks.faction,
      ),
    );
  }
  if (levels.length) {
    groups.push(
      createFold(
        'Level',
        () => getStepTitle(levels, picks.level),
        true,
        createRadios('level', levels),
        () => !!picks.level,
      ),
    );
  }
  if (upgrades.length) {
    groups.push(
      createFold(
        'Upgrades',
        () => countPicked(picks.upgrades.length),
        true,
        createUpgradeRows(controls),
        () => picks.upgrades.length > 0,
      ),
    );
  }
  if (controls.randomTextureCount) {
    groups.push(createRandomFold(controls.randomTextureCount));
  }
  if (damage.length || brokenSides.length) {
    groups.push(
      createFold(
        'Damage',
        () =>
          [
            getStepTitle(damage, picks.damage),
            ...(picks.sides.size ? [`${picks.sides.size} sides broken`] : []),
          ]
            .filter(Boolean)
            .join(', '),
        false,
        [...createRadios('damage', damage), ...createChecks('sides', brokenSides)],
        () => !!picks.damage || picks.sides.size > 0,
      ),
    );
  }
  if (construction.length) {
    groups.push(
      createFold(
        'Construction',
        () => getStepTitle(construction, picks.construction),
        false,
        createRadios('construction', construction),
        () => !!picks.construction,
      ),
    );
  }
  if (variations.length) {
    groups.push(
      createFold(
        'Variation',
        () => getStepTitle(variations, picks.variation),
        false,
        createRadios('variation', variations),
        () => !!picks.variation,
      ),
    );
  }
  if (forms.length) {
    groups.push(
      createFold(
        'Other forms',
        () => countPicked(picks.forms.size),
        false,
        createChecks('forms', forms),
        () => picks.forms.size > 0,
      ),
    );
  }
  $('objectAppearanceSection').hidden = !groups.length;
  $('objectAppearance').replaceChildren(...groups);
  $('objectAppearanceReset').onclick = () => {
    panel.picks = createPicks();
    panel.isFollowing = true;
    render();
    panel.onChange();
  };
  sync();
};

export const showAppearance = (scene: ObjectScene, onChange: () => void): void => {
  if (panel.scene?.name !== scene.name) {
    panel.picks = createPicks();
    panel.composed = undefined;
    panel.controls = undefined;
    folds.clear();
  }
  panel.scene = scene;
  panel.onChange = onChange;
  render();
};

export const setComposedOptions = (options: AppearanceOptions | undefined): void => {
  if (JSON.stringify(options) !== JSON.stringify(panel.composed)) {
    const before = JSON.stringify(getAppearance());

    panel.composed = options;
    render();
    if (before !== JSON.stringify(getAppearance())) {
      panel.onChange();
    }
  }
};
