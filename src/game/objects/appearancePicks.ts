import { switchUpgrade } from './appearanceControls';
import type {
  AppearanceControls,
  AppearanceStep,
  ConditionStep,
  LevelStep,
} from './appearanceControls';
import { SNOW_CONDITION } from './objectAppearance';
import type { AppearanceChoice } from './objectAppearance';
import type { AppearanceChange } from './partBindings';

export interface AppearancePicks {
  isSnowy: boolean;
  faction: string;
  level: string;
  upgrades: string[];
  damage: string;
  construction: string;
  variation: string;
  sides: Set<string>;
  forms: Set<string>;
  randomTexture?: number;
}

const RADIOS = [
  ['damage', 'damage'],
  ['construction', 'construction'],
  ['variation', 'variations'],
] as const;
const CHECKS = [
  ['sides', 'brokenSides'],
  ['forms', 'forms'],
] as const;

const hasName = (names: readonly string[], name: string) =>
  names.some((each) => each.toLowerCase() === name.toLowerCase());

export const createPicks = (): AppearancePicks => ({
  isSnowy: false,
  faction: '',
  level: '',
  upgrades: [],
  damage: '',
  construction: '',
  variation: '',
  sides: new Set(),
  forms: new Set(),
});

export const findStep = <Step extends AppearanceStep>(
  steps: readonly Step[],
  title: string,
): Step | undefined => steps.find((step) => step.title === title) ?? steps[0];

export const getChoice = (
  controls: AppearanceControls | undefined,
  picks: AppearancePicks,
): AppearanceChoice => {
  if (!controls) {
    return { isSnowy: picks.isSnowy, upgrades: [], conditions: [] };
  }

  const conditions = [
    ...RADIOS.map(([key, list]) => findStep<ConditionStep>(controls[list], picks[key])),
    ...CHECKS.flatMap(([key, list]) => controls[list].filter((step) => picks[key].has(step.title))),
  ].flatMap((step) => step?.conditions ?? []);
  const level = findStep<LevelStep>(controls.levels, picks.level);

  return {
    isSnowy: picks.isSnowy,
    upgrades: [
      ...(findStep(controls.factions, picks.faction)?.upgrades ?? []),
      ...(level?.upgrades ?? []),
      ...picks.upgrades,
    ],
    conditions,
    randomTexture: picks.randomTexture,
    ...(level?.index ? { level: level.index } : {}),
  };
};

const toPick = (steps: readonly AppearanceStep[], step: AppearanceStep | undefined) =>
  !step || step === steps[0] ? '' : step.title;

const MAX_NEXT_CHOICES = 64;

export const listNextChoices = (
  controls: AppearanceControls,
  picks: AppearancePicks,
): AppearanceChoice[] => {
  const next: AppearancePicks[] = [];
  const addSteps = (
    key: 'level' | 'faction' | (typeof RADIOS)[number][0],
    steps: readonly AppearanceStep[],
  ) => {
    const now = findStep(steps, picks[key]);

    for (const step of steps.filter((each) => each !== now)) {
      next.push({ ...picks, [key]: toPick(steps, step) });
    }
  };

  next.push(picks);
  for (const { name, isHeld } of controls.upgrades) {
    if (!isHeld) {
      const on = !hasName(picks.upgrades, name);

      next.push({ ...picks, upgrades: switchUpgrade(controls.upgrades, picks.upgrades, name, on) });
    }
  }
  addSteps('level', controls.levels);
  if (controls.canSnow) {
    next.push({ ...picks, isSnowy: !picks.isSnowy });
  }
  for (const [key, list] of RADIOS) {
    addSteps(key, controls[list]);
  }
  addSteps('faction', controls.factions);
  for (const [key, list] of CHECKS) {
    for (const { title } of controls[list]) {
      const toggled = new Set(picks[key]);

      if (!toggled.delete(title)) {
        toggled.add(title);
      }
      next.push({ ...picks, [key]: toggled });
    }
  }
  for (let at = 0; at < Math.min(controls.randomTextureCount, 8); at++) {
    next.push({ ...picks, randomTexture: at });
  }
  return next.slice(0, MAX_NEXT_CHOICES).map((each) => getChoice(controls, each));
};

export const applyPicks = (
  controls: AppearanceControls,
  picks: AppearancePicks,
  change: AppearanceChange,
): void => {
  const { levels, upgrades, factions } = controls;
  const getReached = () => levels.indexOf(findStep(levels, picks.level)!);
  const climbTo = (at: number) => {
    if (at > getReached()) {
      picks.level = toPick(levels, levels[at]);
    }
  };
  const dropBelow = (at: number) => {
    if (at > 0 && at <= getReached()) {
      picks.level = toPick(levels, levels[at - 1]);
    }
  };

  for (const name of change.take ?? []) {
    if (upgrades.some((each) => each.name.toLowerCase() === name.toLowerCase())) {
      picks.upgrades = switchUpgrade(upgrades, picks.upgrades, name, false);
    } else {
      dropBelow(levels.findIndex((step) => hasName(step.upgrades, name)));
    }
  }
  for (const name of change.give ?? []) {
    const faction = factions.find((step) => hasName(step.upgrades, name));

    if (faction) {
      picks.faction = toPick(factions, faction);
    } else if (upgrades.some((each) => each.name.toLowerCase() === name.toLowerCase())) {
      picks.upgrades = switchUpgrade(upgrades, picks.upgrades, name, true);
    } else {
      climbTo(levels.findIndex((step) => hasName(step.upgrades, name)));
    }
  }
  if (change.level !== undefined) {
    climbTo(levels.findIndex((step) => step.index >= change.level!));
  }
  if (change.belowLevel !== undefined) {
    dropBelow(levels.findIndex((step) => step.index >= change.belowLevel!));
  }
  for (const [conditions, on] of [
    [change.release ?? [], false],
    [change.hold ?? [], true],
  ] as const) {
    for (const condition of conditions) {
      if (condition === SNOW_CONDITION) {
        picks.isSnowy = on;
      }
      for (const [key, list] of RADIOS) {
        const steps: readonly ConditionStep[] = controls[list];
        const step = steps.find((each) => each.conditions.includes(condition));

        if (step && (on || findStep(steps, picks[key]) === step)) {
          picks[key] = on ? step.title : '';
        }
      }
      for (const [key, list] of CHECKS) {
        for (const step of controls[list].filter((each) => each.conditions.includes(condition))) {
          if (on) {
            picks[key].add(step.title);
          } else {
            picks[key].delete(step.title);
          }
        }
      }
    }
  }
};
