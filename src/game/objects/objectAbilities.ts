import type { SageBlock, SageDocument } from '../../formats/ini/sageIniParser';
import type { SageIniSchema } from '../../formats/ini/sageIniSchema';
import { findBodyDraw, pickPlayingState } from './drawStates';
import { pickModelState } from './objectAppearance';
import { getEffectConditions } from './objectEffects';
import type { ObjectEffect } from './objectEffects';
import { readStateConditions } from './objectScene';
import type { ObjectScene, SceneState } from './objectScene';

export type AbilityPlace = 'self' | 'target' | 'flight';

export interface AbilityEffect {
  kind: 'fxList' | 'system';
  name: string;
  source: string;
  place: AbilityPlace;
  bone?: string;
  delay?: number;
  repeat?: { count: number; every: number };
  phase?: number;
}

export interface AbilityPhase {
  conditions: string[];
  start: number;
  length?: number;
}

export interface ObjectAbility {
  id: string;
  title: string;
  name: string;
  description?: string;
  trigger: string;
  effects: AbilityEffect[];
  phases: AbilityPhase[];
  sounds: string[];
  creates: string[];
}

export interface AbilityGroup {
  title: string;
  abilities: ObjectAbility[];
}

export type AbilityDefinitionKind =
  | 'FXList'
  | 'ParticleSystem'
  | 'ObjectCreationList'
  | 'Weapon'
  | 'ModifierList'
  | 'Object';

export interface AbilitySources {
  findDefinitionLines(keyword: string, name: string): Promise<readonly string[] | undefined>;
  isDefined(kind: AbilityDefinitionKind, name: string): boolean;
  readObject(name: string): Promise<ObjectScene | undefined>;
  listLevels?(): Promise<readonly (readonly string[])[]>;
  resolveMacro?(name: string): string | undefined;
  findText?(label: string): string | undefined;
}

const MAX_ABILITIES = 256;
const MAX_EFFECTS = 48;
const MAX_BUTTONS = 128;
const MAX_DEFINITIONS = 160;
const MAX_OBJECTS = 24;
const MAX_DEPTH = 3;
const MAX_FIELDS = 512;
const MAX_LEVELS = 16;
const TARGET_DISTANCE = 100;
const MAX_FLIGHT = 3;
const MAX_DELAY = 10;
const EVENT_FRAME_RATE = 30;
const ORDINALS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
const LOGIC_FRAME_RATE = 5;
const OPEN_TRIGGERS = 3;
const MAX_TRIGGERS = 32;

const GROUPS = {
  abilities: 'Abilities',
  upgrades: 'Upgrades bought here',
  weapons: 'Weapons',
  levels: 'Level up',
  damage: 'When damaged',
  death: 'When it dies',
  construction: 'Construction, sale and capture',
  upgraded: 'When an upgrade arrives',
  ambient: 'Ambient and auras',
  other: 'Other events',
} as const;

type GroupKey = keyof typeof GROUPS;

interface Field {
  key: string;
  values: string[];
}

interface Module {
  type: string;
  tag?: string;
  fields: Field[];
}

interface Placing {
  place: AbilityPlace;
  delay: number;
  landing?: Placing;
  repeat?: AbilityEffect['repeat'];
  isAttack?: boolean;
  preAttack?: Placing;
}

interface ConditionSpan {
  condition: string;
  start: number;
  end?: number;
}

interface Gathered {
  effects: AbilityEffect[];
  phases: AbilityPhase[];
  sounds: Set<string>;
  creates: Set<string>;
  seen: Set<string>;
}

const MODULE_SLOT = /^(behavior|body|clientupdate|clientbehavior)$/i;
const NONE = /^none$/i;
const NUMBER = /^-?\d+(\.\d+)?$/;
const PHASE = /^(initial|midpoint|final)$/i;
const ATTACK: Placing = { place: 'self', delay: 0, isAttack: true, preAttack: { place: 'self', delay: 0 } };

const stripKey = (value: string) => value.slice(value.indexOf(':') + 1);

const isDeathEffect = ({ module, field }: ObjectEffect) => /die$|death|destroy/i.test(module ?? '') || /death/i.test(field);

const createGathered = (): Gathered => ({
  effects: [],
  phases: [],
  sounds: new Set(),
  creates: new Set(),
  seen: new Set(),
});

const toWords = (name: string) =>
  name
    .replace(/^(Command_|ModuleTag_|Upgrade_)/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim();

const describeModule = (type: string) => {
  const words = toWords(type).replace(/ (Update|Behavior|Module|Client Behavior)$/, '');

  return words.charAt(0) + words.slice(1).toLowerCase();
};

const readDefinitionFields = (lines: readonly string[]): Field[] => {
  const fields: Field[] = [];
  let depth = 0;

  for (const raw of lines.slice(1)) {
    const line = raw.replace(/(;|\/\/).*/, '').trim();

    if (!line) {
      continue;
    }
    if (/^end$/i.test(line)) {
      if (depth === 0) {
        break;
      }
      depth--;
      continue;
    }

    const field = /^([^\s=]+)\s*=\s*(.*)$/.exec(line);

    if (!field) {
      depth++;
      const inline = /^\S+\s+([^\s=]+)\s*=\s*(.*)$/.exec(line);

      if (inline) {
        fields.push({ key: inline[1], values: inline[2].split(/\s+/).filter(Boolean) });
      }
    } else if (fields.length < MAX_FIELDS) {
      fields.push({ key: field[1], values: field[2].split(/\s+/).filter(Boolean) });
    }
  }
  return fields;
};

const readModules = (parsed: SageDocument, object: SageBlock): Module[] =>
  object.children
    .filter((block) => MODULE_SLOT.test(block.keyword) && block.moduleType)
    .map((block) => ({
      type: block.moduleType!,
      tag: block.moduleTag,
      fields: parsed.statements
        .filter(
          (statement) =>
            statement.kind === 'field' &&
            statement.line > block.startLine &&
            statement.line < block.endLine,
        )
        .slice(0, MAX_FIELDS)
        .map((statement) => ({
          key: statement.keyword.text,
          values: statement.values.map((value) => value.text),
        })),
    }));

const readValues = (fields: readonly Field[], key: string) =>
  fields.filter((field) => field.key.toLowerCase() === key).flatMap((field) => field.values);

const createNumberReader =
  (resolveMacro: AbilitySources['resolveMacro']) =>
  (text: string | undefined): number => {
    const written = text && !NUMBER.test(text) ? resolveMacro?.(text) : text;
    const value = Number.parseFloat(written ?? '');

    return Number.isFinite(value) && value > 0 ? value : 0;
  };

const KIND_FIELDS: [AbilityDefinitionKind, RegExp, readonly string[]][] = [
  ['FXList', /fx/i, ['FXList']],
  ['ParticleSystem', /particle|psys|system/i, ['FXParticleSystem', 'ParticleSystem']],
  ['ObjectCreationList', /ocl|creationlist/i, ['ObjectCreationList']],
  ['ModifierList', /modifier|bonusname/i, ['ModifierList']],
  ['Weapon', /weapon|warhead/i, ['Weapon']],
  ['Object', /object|payload|transport|thing|spawn|projectile|template/i, ['Object']],
];
const SOUND_FIELD = /sound/i;
const SKIPPED_FIELD = /^(specialpowertemplate|specialpower|specialability|triggeredby|conflictswith|commandset\w*|upgrade\w*|requiredupgrade\w*|forbiddenupgrade\w*|objectfilter|\w*filter|kindof|deathtypes|exemptstatus|requiredstatus)$/i;

interface Reference {
  kind: AbilityDefinitionKind | 'sound';
  name: string;
}

const readReferences = (
  field: Field,
  schema: SageIniSchema,
  sources: AbilitySources,
): Reference[] => {
  if (SKIPPED_FIELD.test(field.key)) {
    return [];
  }

  const namespaces = schema.getReferenceNamespaces(field.key);
  const isProjectile = /projectile/i.test(field.key);
  const kinds = KIND_FIELDS.filter(
    ([, pattern, names]) => pattern.test(field.key) || names.some((name) => namespaces.includes(name)),
  )
    .map(([kind]) => kind)
    .sort((a, b) => (isProjectile ? Number(b === 'Object') - Number(a === 'Object') : 0));
  const isSound = SOUND_FIELD.test(field.key) || namespaces.includes('AudioEvent');
  const references: Reference[] = [];

  for (const value of field.values.map(stripKey)) {
    if (!value || NONE.test(value) || NUMBER.test(value)) {
      continue;
    }

    const kind = kinds.find((each) => sources.isDefined(each, value));

    if (kind) {
      references.push({ kind, name: value });
    } else if (isSound && /^[a-z_]\w*$/i.test(value) && !/^(yes|no|true|false)$/i.test(value)) {
      references.push({ kind: 'sound', name: value });
    }
  }
  return references;
};

const getWeaponMoment = (key: string, kind: Reference['kind']) => {
  const field = key.toLowerCase();

  if (/^(preattackfx|firefxpreattack)$/.test(field)) {
    return 'windUp';
  }
  if (/^(firefx|fireflankfx|veterancyfirefx|firesound\w*|firefxbone)$/.test(field)) {
    return 'fire';
  }
  if (kind === 'Object' && /projectile/.test(field)) {
    return 'flight';
  }
  return 'impact';
};

const createWalker = (schema: SageIniSchema, sources: AbilitySources) => {
  const definitions = new Map<string, Promise<Field[]>>();
  const objects = new Map<string, Promise<ObjectScene | undefined>>();
  const readNumber = createNumberReader(sources.resolveMacro);

  const readDefinition = (keyword: string, name: string) => {
    const key = `${keyword}/${name}`.toLowerCase();
    let read = definitions.get(key);

    if (!read) {
      if (definitions.size >= MAX_DEFINITIONS) {
        return Promise.resolve([]);
      }
      read = sources
        .findDefinitionLines(keyword, name)
        .then((lines) => readDefinitionFields(lines ?? []))
        .catch(() => []);
      definitions.set(key, read);
    }
    return read;
  };

  const readObject = (name: string) => {
    const key = name.toLowerCase();
    let read = objects.get(key);

    if (!read) {
      if (objects.size >= MAX_OBJECTS) {
        return Promise.resolve(undefined);
      }
      read = sources.readObject(name).catch(() => undefined);
      objects.set(key, read);
    }
    return read;
  };

  const addEffect = (into: Gathered, { delay = 0, ...effect }: AbilityEffect) => {
    const seconds = Math.round(Math.min(MAX_DELAY, delay) * 100) / 100;
    const isListed = into.effects.some(
      (each) =>
        each.name.toLowerCase() === effect.name.toLowerCase() &&
        each.place === effect.place &&
        each.bone === effect.bone &&
        (each.delay ?? 0) === seconds,
    );

    if (!isListed && into.effects.length < MAX_EFFECTS) {
      into.effects.push(seconds > 0 ? { ...effect, delay: seconds } : effect);
    }
  };

  const addStateEffects = (into: Gathered, state: SceneState, at: Placing, owner?: string, phase?: number) => {
    const where = `${owner ? `${owner}'s ` : ''}${state.label}`;
    const shared = {
      place: at.place,
      ...(at.repeat ? { repeat: at.repeat } : {}),
      ...(phase === undefined ? {} : { phase }),
    };

    for (const { bone, system } of state.particles) {
      addEffect(into, {
        kind: 'system',
        name: system,
        source: `on ${NONE.test(bone) ? 'the origin' : bone}, in ${where}`,
        ...shared,
        ...(NONE.test(bone) || at.place !== 'self' || owner ? {} : { bone }),
        delay: at.delay,
      });
    }
    for (const name of state.fx) {
      addEffect(into, { kind: 'fxList', name, source: `entering ${where}`, ...shared, delay: at.delay });
    }
    for (const { name, frame } of state.fxEvents ?? []) {
      addEffect(into, {
        kind: 'fxList',
        name,
        source: `frame ${frame} of ${where}`,
        ...shared,
        delay: at.delay + frame / EVENT_FRAME_RATE,
      });
    }
  };

  const followObject = async (into: Gathered, name: string, at: Placing) => {
    into.creates.add(name);

    const key = `object/${name}/${at.place}`.toLowerCase();

    if (into.seen.has(key)) {
      return;
    }
    into.seen.add(key);

    const scene = await readObject(name);

    if (!scene) {
      return;
    }
    for (const state of scene.states.filter((each) => !readStateConditions(each).length)) {
      addStateEffects(into, state, at, scene.name);
    }
    const { landing } = at;

    if (!landing) {
      return;
    }
    for (const effect of scene.fx.filter(isDeathEffect)) {
      addEffect(into, {
        kind: effect.isSystem ? 'system' : 'fxList',
        name: effect.name,
        source: `${effect.field} of ${scene.name}`,
        place: landing.place,
        ...(landing.repeat ? { repeat: landing.repeat } : {}),
        delay: landing.delay,
      });
    }
  };

  const followWeapon = async (
    into: Gathered,
    name: string,
    from: Placing,
    to: AbilityPlace,
    depth: number,
  ) => {
    const key = `weapon/${name}/${from.place}/${to}`.toLowerCase();

    if (into.seen.has(key)) {
      return;
    }
    into.seen.add(key);

    const fields = await readDefinition('Weapon', name);
    const windUp = from.isAttack ? readNumber(readValues(fields, 'preattackdelay')[0]) / 1000 : 0;
    const speed = readNumber(readValues(fields, 'weaponspeed')[0]);
    const flies = fields.some((field) =>
      readReferences(field, schema, sources).some(
        (reference) => getWeaponMoment(field.key, reference.kind) === 'flight',
      ),
    );
    const flight = flies && speed > 0 ? Math.min(MAX_FLIGHT, TARGET_DISTANCE / speed) : 0;
    const { repeat } = from;
    const impact: Placing = { place: to, delay: from.delay + windUp + flight, repeat };
    const placings: Record<ReturnType<typeof getWeaponMoment>, Placing | undefined> = {
      windUp: from.preAttack,
      fire: { place: from.place, delay: from.delay + windUp, repeat },
      flight: { place: from.place === to ? to : 'flight', delay: from.delay + windUp, landing: impact, repeat },
      impact,
    };

    await followFields(into, fields, (field, kind) => placings[getWeaponMoment(field.key, kind)], `weapon ${name}`, depth, to);
  };

  const followDefinition = async (
    into: Gathered,
    keyword: 'ObjectCreationList' | 'ModifierList',
    name: string,
    at: Placing,
    depth: number,
  ) => {
    const key = `${keyword}/${name}/${at.place}`.toLowerCase();

    if (into.seen.has(key)) {
      return;
    }
    into.seen.add(key);

    const words = keyword === 'ObjectCreationList' ? 'creation list' : 'modifier list';

    await followFields(into, await readDefinition(keyword, name), () => at, `${words} ${name}`, depth, at.place);
  };

  const followFields = async (
    into: Gathered,
    fields: readonly Field[],
    placeOf: (field: Field, kind: Reference['kind']) => Placing | undefined,
    owner: string | undefined,
    depth: number,
    target: AbilityPlace,
  ): Promise<void> => {
    for (const field of fields) {
      for (const reference of readReferences(field, schema, sources)) {
        const at = placeOf(field, reference.kind);

        if (!at) {
          continue;
        }

        const phase = PHASE.exec(field.values[0] ?? '')?.[0].toLowerCase();
        const written = phase ? `${field.key} ${phase}` : field.key;
        const source = owner ? `${written} of ${owner}` : written;
        const bone = field.values.find((value) => /^bone:(?!none$)./i.test(value));

        if (reference.kind === 'sound') {
          into.sounds.add(reference.name);
        } else if (reference.kind === 'FXList' || reference.kind === 'ParticleSystem') {
          addEffect(into, {
            kind: reference.kind === 'FXList' ? 'fxList' : 'system',
            name: reference.name,
            source,
            place: at.place,
            ...(bone && at.place === 'self' ? { bone: stripKey(bone) } : {}),
            ...(at.repeat ? { repeat: at.repeat } : {}),
            delay: at.delay,
          });
        } else if (reference.kind === 'Object') {
          if (depth < MAX_DEPTH) {
            await followObject(into, reference.name, at);
          } else {
            into.creates.add(reference.name);
          }
        } else if (depth >= MAX_DEPTH) {
          continue;
        } else if (reference.kind === 'Weapon') {
          await followWeapon(into, reference.name, at, at.place === 'self' ? target : at.place, depth + 1);
        } else {
          await followDefinition(into, reference.kind, reference.name, at, depth + 1);
        }
      }
    }
  };

  return { followFields, followWeapon, addStateEffects, readNumber };
};

const CAST_FIELD = /^(unpacktime|preparationtime|packtime|persistentpreptime)$/i;

const isCast = (module: Module) =>
  /specialabilityupdate$/i.test(module.type) || module.fields.some((field) => CAST_FIELD.test(field.key));

const isWrittenYes = (fields: readonly Field[], key: string) => /^yes$/i.test(readValues(fields, key)[0] ?? '');

const toMilliseconds = (seconds: number) => Math.round(seconds * 1000) / 1000;

const toLogicSeconds = (milliseconds: number) =>
  Math.ceil(toMilliseconds((milliseconds * LOGIC_FRAME_RATE) / 1000)) / LOGIC_FRAME_RATE;

const getSpecialWeaponCondition = (which: number) =>
  Number.isInteger(which) && which >= 1 && which <= ORDINALS.length ? `SPECIAL_WEAPON_${ORDINALS[which - 1]}` : undefined;

interface Cast {
  spans: ConditionSpan[];
  preparation: number;
  trigger: number;
  repeat?: AbilityEffect['repeat'];
}

const readCast = (module: Module, readNumber: (text: string | undefined) => number): Cast => {
  const { fields } = module;
  const readField = (key: string) => readNumber(readValues(fields, key)[0]);
  const unpack = toLogicSeconds(readField('unpacktime'));
  const preparation = toLogicSeconds(readField('preparationtime'));
  const persistence = toLogicSeconds(readField('persistentpreptime'));
  const pack = toLogicSeconds(readField('packtime'));
  const shots = readValues(fields, 'maxshots').length
    ? Math.max(1, Math.ceil(readField('maxshots') / Math.max(1, readField('shotsperburst'))))
    : undefined;
  const persists = preparation > 0 && persistence > 0;
  const isSkipping = persists && isWrittenYes(fields, 'skipcontinue');
  const count = isSkipping ? 2 : persists ? Math.floor(readField('persistentcount')) || shots || OPEN_TRIGGERS : 1;
  const triggers = Math.min(MAX_TRIGGERS, count, shots ?? count);
  const fired = isSkipping ? triggers - 1 : triggers;
  const trigger = toMilliseconds(unpack + preparation);
  const last = toMilliseconds(trigger + (triggers - 1) * persistence);
  const end = toMilliseconds(last + Math.max(pack, toLogicSeconds(readField('freezeaftertriggerduration'))));
  const variation = readField('unpackingvariation');
  const spans: ConditionSpan[] = [
    ...(variation >= 1 ? [`PACKING_TYPE_${Math.round(variation)}`] : []),
    getSpecialWeaponCondition(readField('whichspecialweapon')),
  ].flatMap((condition) => (condition ? [{ condition, start: 0, end }] : []));

  if (unpack > 0) {
    spans.push({ condition: 'UNPACKING', start: 0, end: unpack });

    const custom = readValues(fields, 'customanimandduration');
    const state = custom.find((value) => /^animstate:/i.test(value));
    const readToken = (name: string) =>
      toLogicSeconds(readNumber(stripKey(custom.find((value) => value.toLowerCase().startsWith(`${name}:`)) ?? '')));

    if (state) {
      const start = readToken('triggertime');
      const lasts = readToken('animtime');

      spans.push({ condition: stripKey(state).toUpperCase(), start, end: lasts ? toMilliseconds(start + lasts) : end });
    }

    const timed = readValues(fields, 'triggermodelcondition')[0];
    const frames = Math.trunc(readField('triggermodelconditionduration'));

    if (timed && frames > 0) {
      spans.push({ condition: stripKey(timed).toUpperCase(), start: 0, end: frames / LOGIC_FRAME_RATE });
    }
  }
  const prepared = pack > 0 ? last : end;

  if (prepared > unpack) {
    spans.push({ condition: 'PREPARING', start: unpack, end: prepared });
  }
  if (pack > 0) {
    spans.push({ condition: 'PACKING', start: last, end });
  }
  return { spans, preparation: unpack, trigger, ...(fired > 1 ? { repeat: { count: fired - 1, every: persistence } } : {}) };
};

const readRaisedConditions = (module: Module): ConditionSpan[] => {
  const raised = new Set<string>();

  for (const { key, values } of module.fields) {
    const field = key.toLowerCase();

    if (field === 'addconditionflags') {
      values.forEach((value) => raised.add(value.toUpperCase()));
    } else if (/^(addtempconditionflag|triggermodelcondition)$/.test(field)) {
      values.filter((value) => !NUMBER.test(value)).forEach((value) => raised.add(stripKey(value).toUpperCase()));
    } else if (field === 'customanimandduration') {
      const state = values.find((value) => /^animstate:/i.test(value));

      if (state) {
        raised.add(stripKey(state).toUpperCase());
      }
    }
    getEffectConditions(module.type, key)?.forEach((condition) => raised.add(condition));
  }
  raised.delete('');
  raised.delete('NONE');
  return [...raised].map((condition) => ({ condition, start: 0 }));
};

const toPhases = (spans: readonly ConditionSpan[]): AbilityPhase[] => {
  const times = [...new Set(spans.flatMap(({ start, end }) => (end === undefined ? [start] : [start, end])))].sort(
    (a, b) => a - b,
  );
  const phases: AbilityPhase[] = [];

  times.forEach((start, at) => {
    const next = times[at + 1];
    const conditions = [
      ...new Set(
        spans
          .filter((span) => span.start <= start && (span.end === undefined || span.end > start))
          .map(({ condition }) => condition),
      ),
    ];
    const previous = phases[phases.length - 1];
    const isSame =
      previous?.length !== undefined &&
      toMilliseconds(previous.start + previous.length) === start &&
      previous.conditions.join() === conditions.join();
    const from = isSame ? previous.start : start;

    if (!conditions.length) {
      return;
    }
    if (isSame) {
      phases.pop();
    }
    phases.push({ conditions, start: from, ...(next === undefined ? {} : { length: toMilliseconds(next - from) }) });
  });
  return phases;
};

const listRaisedStates = (scene: ObjectScene, raised: ReadonlySet<string>): SceneState[] => {
  if (!raised.size) {
    return [];
  }

  const held = [...raised];
  const draws = [...new Set([findBodyDraw(scene), ...scene.states.map((state) => state.draw)])].flatMap(
    (draw) => draw ?? [],
  );
  const isRaised = (state: SceneState | undefined): state is SceneState =>
    !!state && readStateConditions(state).some((condition) => raised.has(condition));

  return draws.flatMap((draw) =>
    [
      pickModelState(
        scene.states.filter((state) => state.draw === draw),
        raised,
      ),
      pickPlayingState(scene, draw, held),
    ].filter(isRaised),
  );
};

const groupModule = (module: Module): GroupKey => {
  const type = module.type.toLowerCase();

  if (/specialpower|specialability/.test(type)) {
    return 'abilities';
  }
  if (/die$|death|destroy|topple|collapse|rubble/.test(type)) {
    return 'death';
  }
  if (/damage|wound/.test(type)) {
    return 'damage';
  }
  if (/level|experience|veteran/.test(type)) {
    return 'levels';
  }
  if (/built|build|construct|sell|sold|capture|repair/.test(type)) {
    return 'construction';
  }
  if (module.fields.some((field) => /^triggeredby$/i.test(field.key))) {
    return 'upgraded';
  }
  if (/spawn|lifetime|ambient|emit|aura|area|weather|heal|leadership|stealth|invisib/.test(type)) {
    return 'ambient';
  }
  return 'other';
};

const describeModuleTrigger = (module: Module, group: GroupKey) => {
  const triggers = readValues(module.fields, 'triggeredby');
  const deathTypes = readValues(module.fields, 'deathtypes');
  const words = describeModule(module.type);

  if (group === 'death' && deathTypes.length) {
    return `${words}, for deaths ${deathTypes.join(' ')}`;
  }
  if (triggers.length) {
    return `${words}, on ${triggers.join(' or ')}`;
  }
  return words;
};

const findLabelText = (sources: AbilitySources, label: string | undefined) =>
  label ? sources.findText?.(label)?.replace(/&(?=\S)/g, '').trim() || undefined : undefined;

const readOwnLevels = async (scene: ObjectScene, sources: AbilitySources) => {
  const name = scene.name.toLowerCase();
  const levels: { rank: string; fields: Field[] }[] = [];

  for (const lines of (await sources.listLevels?.().catch(() => [])) ?? []) {
    const fields = readDefinitionFields(lines);
    const targets = readValues(fields, 'targetnames').flatMap((target) => [
      target,
      ...(sources.resolveMacro?.(target)?.split(/\s+/) ?? []),
    ]);

    if (targets.some((target) => target.toLowerCase() === name)) {
      levels.push({ rank: readValues(fields, 'rank')[0] ?? `${levels.length + 1}`, fields });
    }
    if (levels.length >= MAX_LEVELS) {
      break;
    }
  }
  return levels.sort((a, b) => (Number(a.rank) || 0) - (Number(b.rank) || 0));
};

export const listObjectAbilities = async (
  parsed: SageDocument,
  scene: ObjectScene,
  schema: SageIniSchema,
  sources: AbilitySources,
): Promise<AbilityGroup[]> => {
  const object = parsed.blocks.find((block) => /^(object|childobject|objectreskin)$/i.test(block.keyword));

  if (!object) {
    return [];
  }

  const modules = readModules(parsed, object);
  const walker = createWalker(schema, sources);
  const claimed = new Set<Module>();
  const groups = new Map<GroupKey, ObjectAbility[]>();
  let count = 0;

  const addAbility = (group: GroupKey, ability: Omit<ObjectAbility, 'id' | 'effects' | 'phases' | 'sounds' | 'creates'>, gathered: Gathered) => {
    if (count >= MAX_ABILITIES) {
      return;
    }
    count++;
    groups.set(group, [
      ...(groups.get(group) ?? []),
      {
        id: `${group}/${count}`,
        ...ability,
        effects: gathered.effects,
        phases: gathered.phases,
        sounds: [...gathered.sounds],
        creates: [...gathered.creates],
      },
    ]);
  };

  const gatherModules = async (owned: readonly Module[], into: Gathered, aimed: AbilityPlace) => {
    const casts = new Map(owned.filter(isCast).map((module) => [module, readCast(module, walker.readNumber)]));
    const spans = [...casts.values()].flatMap((cast) => cast.spans);
    const triggered = owned.some((module) => isWrittenYes(module.fields, 'updatemodulestartsattack'))
      ? ([...casts.values()][0]?.preparation ?? 0)
      : 0;

    for (const module of owned) {
      const cast = casts.get(module);
      const trigger = cast?.trigger ?? 0;
      const fired: Placing = {
        place: 'self',
        delay: trigger,
        repeat: cast?.repeat,
        ...(isWrittenYes(module.fields, 'playweaponprefirefx') ? { preAttack: { place: 'self', delay: 0 } } : {}),
      };

      if (!cast) {
        spans.push(...readRaisedConditions(module));
      }

      const timed = readValues(module.fields, 'setmodelcondition')[0];
      const lasts = Math.trunc(walker.readNumber(readValues(module.fields, 'setmodelconditiontime')[0]) * LOGIC_FRAME_RATE);

      if (timed && lasts > 0) {
        spans.push({ condition: stripKey(timed).toUpperCase(), start: triggered, end: toMilliseconds(triggered + lasts / LOGIC_FRAME_RATE) });
      }
      await walker.followFields(
        into,
        module.fields,
        (field, kind) => {
          if (kind === 'Weapon') {
            return fired;
          }
          if (kind === 'sound') {
            return { place: 'self', delay: 0 };
          }
          const isEffect = kind === 'FXList' || kind === 'ParticleSystem';
          const isAimed = !!cast || !isEffect || /^triggerfx$/i.test(field.key);

          return { place: isAimed ? aimed : 'self', delay: cast || !isEffect ? trigger : 0 };
        },
        undefined,
        1,
        aimed,
      );
    }

    let before: SceneState[] = [];

    into.phases = toPhases(spans);
    into.phases.forEach(({ conditions, start }, phase) => {
      const states = listRaisedStates(scene, new Set(conditions));

      for (const state of states.filter((each) => !before.includes(each))) {
        walker.addStateEffects(into, state, { place: 'self', delay: start }, undefined, state.kind === 'animation' ? phase : undefined);
      }
      before = states;
    });
  };
  const weapons = new Map<string, { name: string; slots: Set<string>; sets: Set<string> }>();

  for (const set of object.children.filter((block) => /^weaponset$/i.test(block.keyword))) {
    const fields = parsed.statements.filter(
      (statement) => statement.kind === 'field' && statement.line > set.startLine && statement.line < set.endLine,
    );
    const conditions = fields
      .filter((statement) => /^conditions$/i.test(statement.keyword.text))
      .flatMap((statement) => statement.values.map((value) => value.text))
      .filter((value) => !NONE.test(value));

    for (const statement of fields.filter((each) => /^weapon$/i.test(each.keyword.text))) {
      const [slot, name] = statement.values.map((value) => value.text);

      if (slot && name && !NONE.test(name)) {
        const entry = weapons.get(name.toLowerCase()) ?? { name, slots: new Set(), sets: new Set() };

        entry.slots.add(slot.toUpperCase());
        entry.sets.add(conditions.length ? `with ${conditions.join(' ')}` : 'by default');
        weapons.set(name.toLowerCase(), entry);
      }
    }
  }

  const setNames = new Set([
    ...(scene.commandSets ?? []),
    ...modules.flatMap((module) =>
      module.fields.filter((field) => /^commandset(alt)?$/i.test(field.key)).flatMap((field) => field.values.slice(0, 1)),
    ),
  ]);
  const buttons: { name: string; fields: Field[] }[] = [];

  for (const set of setNames) {
    for (const { values } of readDefinitionFields((await sources.findDefinitionLines('CommandSet', set).catch(() => undefined)) ?? [])) {
      const name = values[0];

      if (name && buttons.length < MAX_BUTTONS && !buttons.some((button) => button.name.toLowerCase() === name.toLowerCase())) {
        buttons.push({
          name,
          fields: readDefinitionFields((await sources.findDefinitionLines('CommandButton', name).catch(() => undefined)) ?? []),
        });
      }
    }
  }

  const powerOf = (module: Module) =>
    readValues(module.fields, 'specialpowertemplate')[0]?.toLowerCase();
  const describeButton = (button: { name: string; fields: Field[] }) => ({
    title: findLabelText(sources, readValues(button.fields, 'textlabel')[0]) ?? toWords(button.name),
    name: button.name,
    description: findLabelText(sources, readValues(button.fields, 'descriptlabel')[0]),
  });
  const addSounds = (into: Gathered, fields: readonly Field[]) => {
    for (const field of fields.filter((each) => /sound/i.test(each.key))) {
      field.values.filter((value) => !NONE.test(value)).forEach((value) => into.sounds.add(value));
    }
  };

  const powersOnButtons = new Set<string>();

  for (const button of buttons) {
    const command = readValues(button.fields, 'command')[0]?.toUpperCase() ?? '';
    const power = readValues(button.fields, 'specialpower')[0];
    const isAimed = readValues(button.fields, 'options').some((option) => /need_target|need_object_target/i.test(option));
    const aimed: AbilityPlace = isAimed ? 'target' : 'self';
    const into = createGathered();

    if (power) {
      const owned = modules.filter((module) => powerOf(module) === power.toLowerCase());

      powersOnButtons.add(power.toLowerCase());
      owned.forEach((module) => claimed.add(module));
      await gatherModules(owned, into, aimed);
      addSounds(into, button.fields);
      addAbility(
        'abilities',
        {
          ...describeButton(button),
          trigger: [
            isAimed ? 'Its button, aimed at a target' : 'Its button',
            owned.length
              ? `${power}: ${[...new Set(owned.map((module) => describeModule(module.type)))].join(', ')}`
              : `${power}, which no module of the object answers`,
          ].join('; '),
        },
        into,
      );
    } else if (/FIRE_WEAPON/.test(command)) {
      const slot = readValues(button.fields, 'weaponslot')[0] ?? 'PRIMARY';

      for (const { name, slots } of weapons.values()) {
        if (slots.has(slot.toUpperCase())) {
          await walker.followWeapon(into, name, ATTACK, 'target', 1);
        }
      }
      addSounds(into, button.fields);
      addAbility('abilities', { ...describeButton(button), trigger: `Its button fires the ${slot.toLowerCase()} weapon` }, into);
    } else if (/UPGRADE/.test(command)) {
      const upgrades = readValues(button.fields, 'upgrade');

      if (!upgrades.length) {
        continue;
      }

      const granted = new Set(upgrades.map((each) => each.toLowerCase()));
      const owned: Module[] = [];

      for (let round = 0; round < MAX_DEPTH; round++) {
        const fired = modules.filter(
          (module) =>
            !owned.includes(module) &&
            readValues(module.fields, 'triggeredby').some((trigger) => granted.has(trigger.toLowerCase())),
        );

        fired.forEach((module) => {
          owned.push(module);
          ['grantupgrade', 'upgrade', 'upgradetogrant'].forEach((key) =>
            readValues(module.fields, key).forEach((each) => granted.add(each.toLowerCase())),
          );
        });
        if (!fired.length) {
          break;
        }
      }
      owned.forEach((module) => claimed.add(module));
      await gatherModules(owned, into, 'self');
      addSounds(into, button.fields);
      addAbility(
        'upgrades',
        {
          ...describeButton(button),
          trigger: owned.length
            ? `Its button buys ${upgrades.join(', ')}: ${[...new Set(owned.map((module) => describeModule(module.type)))].join(', ')}`
            : `Its button buys ${upgrades.join(', ')}, which no module of the object answers`,
        },
        into,
      );
    }
  }

  const unbuttoned = new Map<string, Module[]>();

  for (const module of modules) {
    const power = powerOf(module);

    if (power && !powersOnButtons.has(power)) {
      unbuttoned.set(power, [...(unbuttoned.get(power) ?? []), module]);
      claimed.add(module);
    }
  }
  for (const [, owned] of unbuttoned) {
    const into = createGathered();
    const power = readValues(owned[0].fields, 'specialpowertemplate')[0];

    await gatherModules(owned, into, 'self');
    addAbility(
      'abilities',
      {
        title: toWords(power),
        name: power,
        trigger: `No button of the object starts it; ${[...new Set(owned.map((module) => describeModule(module.type)))].join(', ')}`,
      },
      into,
    );
  }

  for (const { name, slots, sets } of weapons.values()) {
    const into = createGathered();

    await walker.followWeapon(into, name, ATTACK, 'target', 1);
    addAbility(
      'weapons',
      {
        title: name,
        name,
        trigger: `${[...slots].map((slot) => slot.toLowerCase()).join(' and ')} weapon, ${[...sets].join('; ')}`,
      },
      into,
    );
  }

  for (const { rank, fields } of await readOwnLevels(scene, sources)) {
    const into = createGathered();

    await walker.followFields(into, fields.filter((field) => /^(levelupfx|attributemodifiers)$/i.test(field.key)), () => ({ place: 'self', delay: 0 }), undefined, 1, 'self');
    if (into.effects.length) {
      addAbility('levels', { title: `Rank ${rank}`, name: `Rank ${rank}`, trigger: `Reaching rank ${rank}` }, into);
    }
  }

  for (const module of modules.filter((each) => !claimed.has(each))) {
    const into = createGathered();
    const group = groupModule(module);

    await gatherModules([module], into, 'self');
    if (into.effects.length) {
      addAbility(
        group,
        {
          title: describeModule(module.type),
          name: module.tag ?? module.type,
          trigger: describeModuleTrigger(module, group),
        },
        into,
      );
    }
  }

  return (Object.keys(GROUPS) as GroupKey[]).flatMap((key) => {
    const abilities = groups.get(key);

    return abilities?.length ? [{ title: GROUPS[key], abilities }] : [];
  });
};
