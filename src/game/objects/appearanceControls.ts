import { SNOW_CONDITION, getRaisedConditions, pickModelState } from './objectAppearance';
import type { AppearanceOptions } from './objectAppearance';
import { describeCondition } from './objectEffects';
import { readStateConditions } from './objectScene';
import type { ObjectScene } from './objectScene';
import { isFactionUpgrade, walkUpgrades } from './walkUpgrades';

export interface AppearanceStep {
  title: string;
  names: string[];
  note?: string;
}

export interface LevelStep extends AppearanceStep {
  upgrades: string[];
  index: number;
}

export interface FactionStep extends AppearanceStep {
  upgrades: string[];
}

export interface ConditionStep extends AppearanceStep {
  conditions: string[];
  isIniName?: boolean;
}

export interface UpgradeSwitch {
  name: string;
  title: string;
  fullTitle: string;
  isHeld: boolean;
  needs: string[];
  excludes: string[];
}

export interface AppearanceControls {
  canSnow: boolean;
  randomTextureCount: number;
  factions: FactionStep[];
  levels: LevelStep[];
  upgrades: UpgradeSwitch[];
  damage: ConditionStep[];
  brokenSides: ConditionStep[];
  construction: ConditionStep[];
  variations: ConditionStep[];
  forms: ConditionStep[];
}

const DAMAGE: readonly [string, string][] = [
  ['DAMAGED', 'Damaged'],
  ['REALLYDAMAGED', 'Really damaged'],
  ['RUBBLE', 'Rubble'],
  ['POST_RUBBLE', 'After the rubble'],
  ['POST_COLLAPSE', 'After the collapse'],
];
const BROKEN_SIDES: readonly [string, string][] = [
  ['DESTROYED_FRONT', 'Front broken'],
  ['DESTROYED_BACK', 'Back broken'],
  ['DESTROYED_LEFT', 'Left broken'],
  ['DESTROYED_RIGHT', 'Right broken'],
];
const CONSTRUCTION: readonly [string[], string][] = [
  [['BUILD_PLACEMENT_CURSOR'], 'Being placed'],
  [['PHANTOM_STRUCTURE'], 'Planned'],
  [['BASE_BUILD'], 'Building plot'],
  [['AWAITING_CONSTRUCTION'], 'Awaiting construction'],
  [['ACTIVELY_BEING_CONSTRUCTED', 'PARTIALLY_CONSTRUCTED'], 'Being built'],
  [['CONSTRUCTION_COMPLETE'], 'Just completed'],
  [['DESTROYED_WHILST_BEING_CONSTRUCTED'], 'Destroyed while being built'],
];
const VARIATIONS: readonly [string, string][] = [
  ['BUILD_VARIATION_ONE', 'Variation 1'],
  ['BUILD_VARIATION_TWO', 'Variation 2'],
];
const ACTION =
  /^(DOOR_|JUST_BUILT|COLLAPSING|DYING|DEATH_|DECAY|SPLATTED|BURNINGDEATH|FREEFALL|MOVING|TURN_|BACKING|ACCELERATE|DECELERATE|WADING|WANDER|FIRING|ATTACKING|PREATTACK|RELOADING|BETWEEN_FIRING|CHARGING|SELECTED|EMOTION|STUNNED|THROWN|HIT_|COMING_OUT_OF|SOLD|PACKING$|UNPACKING|PREPARING|SWAPPING_|USING_|SPECIAL_WEAPON|SPECIAL_ENEMY|WEAPONSTATE|DEPLOY)/;
const NOT_A_LOOK = /^(WORLD_BUILDER|HORDE_EMPTY|LOW|MEDIUM|HIGH|NONE)$/;
const NUMBERED_LEVEL = /^(.+?)_?level_?(\d{1,2})$/i;
const USER_CONDITION = /^USER_\d+$/;

const splitWords = (name: string) =>
  name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z\d])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim()
    .toLowerCase();

export const describeUpgrade = (name: string): string => {
  const words = splitWords(name.replace(/^upgrade_?/i, ''));

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
};

export const removeObjectPrefix = (title: string, objectName: string): string => {
  const words = title.split(' ');
  const objectWords = splitWords(objectName).split(/\s+/);
  let shared = 0;

  while (
    shared < words.length &&
    shared < objectWords.length &&
    words[shared].toLowerCase() === objectWords[shared]
  ) {
    shared++;
  }
  if (!shared || shared === words.length) {
    return title;
  }

  const rest = words.slice(shared).join(' ');

  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

const findLookConditions = (scene: ObjectScene) => {
  const changing = new Set<string>();

  for (const draw of new Set(scene.states.map((state) => state.draw))) {
    const own = scene.states.filter((state) => state.draw === draw && state.kind === 'model');
    const getLook = (held: readonly string[]) => {
      const state = pickModelState(own, new Set(held));

      return JSON.stringify([state?.model?.toLowerCase(), state?.textures ?? []]);
    };

    for (const state of own) {
      const conditions = readStateConditions(state);

      for (const condition of conditions) {
        if (
          !changing.has(condition) &&
          getLook(conditions) !== getLook(conditions.filter((each) => each !== condition))
        ) {
          changing.add(condition);
        }
      }
    }
  }
  return changing;
};

const listLevels = (scene: ObjectScene, offered: readonly string[]): LevelStep[] => {
  const table = scene.levels ?? [];
  const changesLook = new Set(offered.map((each) => each.toLowerCase()));
  const steps: LevelStep[] = [
    { title: `Level ${table[0]?.rank || 1}`, names: [...scene.heldUpgrades], upgrades: [], index: 0 },
  ];
  let reached: string[] = [];

  let top = 1;

  for (const [below, { rank, upgrades }] of table.slice(1).entries()) {
    const index = below + 1;

    reached = [...reached, ...upgrades];
    if (index === scene.bannerLevel || upgrades.some((name) => changesLook.has(name.toLowerCase()))) {
      steps.push({ title: `Level ${rank}`, names: upgrades, upgrades: reached, index });
      top = rank;
    }
  }

  const inTable = new Set(table.flatMap((rung) => rung.upgrades).map((each) => each.toLowerCase()));
  const numbered = new Map<number, string[]>();

  for (const name of offered) {
    const level = Number(NUMBERED_LEVEL.exec(name)?.[2] ?? 0);

    if (level > top && !inTable.has(name.toLowerCase())) {
      numbered.set(level, [...(numbered.get(level) ?? []), name]);
    }
  }
  for (const [level, names] of [...numbered].sort((a, b) => a[0] - b[0])) {
    reached = [...reached, ...names];
    steps.push({
      title: `Level ${level}`,
      names,
      upgrades: reached,
      index: Math.max(0, table.length - 1),
    });
  }
  return steps.length > 1 ? steps : [];
};

const SIDE_FACTIONS: ReadonlyMap<string, string> = new Map([
  ['elves', 'elf'],
  ['dwarves', 'dwarf'],
]);

const listFactions = (scene: ObjectScene, offered: readonly string[]): FactionStep[] => {
  const steps = offered.filter(isFactionUpgrade).map((name) => ({
    title: describeUpgrade(name).replace(/ ?faction$/i, ''),
    names: [name],
    upgrades: [name],
  }));
  const side = (scene.side ?? '').toLowerCase();
  const own = SIDE_FACTIONS.get(side) ?? side;
  const at = steps.findIndex((step) => step.names[0].toLowerCase() === `upgrade_${own}faction`);

  if (!steps.length) {
    return [];
  }
  return at < 0
    ? [{ title: 'None', names: [], upgrades: [] }, ...steps]
    : [steps[at], ...steps.filter((_, index) => index !== at)];
};

const listUpgrades = (
  scene: ObjectScene,
  options: AppearanceOptions,
  levels: readonly LevelStep[],
): UpgradeSwitch[] => {
  const held = walkUpgrades(scene).active;
  const inLevels = new Set(levels.flatMap((level) => [...level.upgrades, ...level.names]).map((each) => each.toLowerCase()));
  const listed = options.upgrades.filter(
    (name) => !inLevels.has(name.toLowerCase()) && !isFactionUpgrade(name),
  );
  const offered = new Map(listed.map((name) => [name.toLowerCase(), name]));

  return listed.map((name) => {
    const key = name.toLowerCase();
    const needs = new Map(
      [...(options.needs?.[key] ?? []), ...(scene.upgradeNeeds?.[key] ?? [])]
        .filter((each) => each.toLowerCase() !== key && offered.has(each.toLowerCase()))
        .map((each) => [each.toLowerCase(), offered.get(each.toLowerCase())!]),
    );

    const fullTitle = describeUpgrade(name);

    return {
      name,
      title: removeObjectPrefix(fullTitle, scene.name),
      fullTitle,
      isHeld: held.has(key),
      needs: [...needs.values()],
      excludes: (options.excludes?.[key] ?? []).flatMap((each) => offered.get(each.toLowerCase()) ?? []),
    };
  });
};

export const listAppearanceControls = (
  scene: ObjectScene,
  options: AppearanceOptions,
): AppearanceControls => {
  const changing = findLookConditions(scene);
  const effectConditions = new Set(scene.fx.flatMap((effect) => effect.when ?? []));
  const raisedByUpgrade = new Set(
    scene.upgrades.flatMap((upgrade) => [
      ...getRaisedConditions(upgrade),
      ...(upgrade.raisesTemporarily ?? []),
    ]),
  );
  const taken = new Set<string>([SNOW_CONDITION]);
  const toStep = (conditions: string[], title: string): ConditionStep => {
    conditions.forEach((condition) => taken.add(condition));
    return { title, names: conditions, conditions };
  };
  const pickOne = (none: string, steps: ConditionStep[]): ConditionStep[] =>
    steps.length ? [{ title: none, names: [], conditions: [] }, ...steps] : [];

  const damage = DAMAGE.flatMap(([condition, title]) =>
    changing.has(condition) || effectConditions.has(condition)
      ? [toStep([condition], title)]
      : [],
  );
  const brokenSides = BROKEN_SIDES.flatMap(([condition, title]) =>
    changing.has(condition) ? [toStep([condition], title)] : [],
  );
  const construction = CONSTRUCTION.flatMap(([conditions, title]) =>
    conditions.some((each) => changing.has(each)) ? [toStep(conditions, title)] : [],
  );
  const variations = VARIATIONS.flatMap(([condition, title]) =>
    changing.has(condition) ? [toStep([condition], title)] : [],
  );
  const padStep = variations.find(({ conditions }) => conditions[0] === scene.padVariation);
  const forms = [...changing]
    .filter(
      (condition) =>
        !taken.has(condition) &&
        !raisedByUpgrade.has(condition) &&
        !ACTION.test(condition) &&
        !NOT_A_LOOK.test(condition),
    )
    .map((condition): ConditionStep => {
      const words = describeCondition(condition);
      const step = toStep([condition], words.charAt(0).toUpperCase() + words.slice(1));

      return USER_CONDITION.test(condition) ? { ...step, isIniName: true } : step;
    });
  const levels = listLevels(scene, options.upgrades);

  return {
    canSnow: options.canSnow,
    randomTextureCount: options.randomTextureCount,
    factions: listFactions(scene, options.upgrades),
    levels,
    upgrades: listUpgrades(scene, options, levels),
    damage: pickOne('Intact', damage),
    brokenSides,
    construction: pickOne('Built', construction),
    variations: padStep
      ? [
          { ...padStep, title: `${padStep.title}, from its building plot` },
          { title: 'As placed', names: [], conditions: [] },
          ...variations
            .filter((step) => step !== padStep)
            .map((step) => ({ ...step, note: 'no plot builds it so' })),
        ]
      : pickOne('As placed', variations),
    forms,
  };
};

export const switchUpgrade = (
  switches: readonly UpgradeSwitch[],
  picked: readonly string[],
  name: string,
  on: boolean,
): string[] => {
  const own = switches.find((each) => each.name.toLowerCase() === name.toLowerCase());
  const out = new Set([name, ...(on ? (own?.excludes ?? []) : [])].map((each) => each.toLowerCase()));
  const next = picked.filter((each) => !out.has(each.toLowerCase()));

  return on && !own?.isHeld ? [...next, name] : next;
};
