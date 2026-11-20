import type { SageBlock, SageDocument } from '../../formats/ini/sageIniParser';
import type { ObjectScene, SceneState } from './objectScene';

export type PartPlacement =
  | { kind: 'origin' }
  | { kind: 'slot'; x: number; y: number }
  | { kind: 'attachBone'; bone: string }
  | { kind: 'passengerBone'; prefix: string; slot: number };

export interface PartSource {
  owner: string;
  moduleType: string;
  moduleTag?: string;
  field: string;
}

export interface ComposedPart {
  id: string;
  parent?: string;
  source: PartSource;
  object?: string;
  draw?: string;
  model?: string;
  animation?: string;
  placement: PartPlacement;
  isShown: boolean;
  note?: string;
}

export interface ObjectComposition {
  parts: ComposedPart[];
  notes: string[];
}

export interface ComposableObject {
  name: string;
  parsed: SageDocument;
  scene: ObjectScene;
}

export interface CompositionSources {
  readObject(name: string): Promise<ComposableObject | undefined>;
  resolveMacro?(name: string): string | undefined;
}

export const MAX_COMPOSED_PARTS = 64;
export const MAX_COMPOSITION_DEPTH = 3;
const MAX_HORDE_SLOTS = 1024;

const HORDE_CONTAINS = /^(hordecontain|horsehordecontain|aodhordecontain)$/i;
const CONTAIN = /contain$/i;
const TREE_DRAW = /^w3dtreedraw$/i;
const DEFAULT_STATE = /^default/i;
const UNCONDITIONED_STATE = /^(default\w*|idleanimationstate)$/i;
const CREW_CONDITION = 'PASSENGER';

const lower = (text: string) => text.toLowerCase();

const readOwnFields = (parsed: SageDocument, block: SageBlock) => {
  const fields = new Map<string, string[][]>();
  const isInChild = (line: number) =>
    block.children.some((child) => child.startLine <= line && line <= child.endLine);

  for (const statement of parsed.statements) {
    if (
      statement.kind !== 'field' ||
      statement.line <= block.startLine ||
      statement.line >= block.endLine ||
      isInChild(statement.line)
    ) {
      continue;
    }

    const key = lower(statement.keyword.text);

    fields.set(key, [
      ...(fields.get(key) ?? []),
      statement.values.map((value) => value.text),
    ]);
  }
  return fields;
};

const findObjectBlock = (parsed: SageDocument) =>
  parsed.blocks.find((block) =>
    /^(object|childobject|objectreskin)$/i.test(block.keyword),
  );

export const readKindOf = (parsed: SageDocument | undefined): string[] => {
  const object = parsed && findObjectBlock(parsed);
  const lines = parsed && object ? readOwnFields(parsed, object).get('kindof') : undefined;

  return (lines?.at(-1) ?? []).map((flag) => flag.toUpperCase());
};

const readCount = (
  text: string | undefined,
  resolveMacro: CompositionSources['resolveMacro'],
): number | undefined => {
  const value = text && /^-?\d+$/.test(text) ? text : text && resolveMacro?.(text)?.trim();
  const count = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isFinite(count) && count >= 0 ? count : undefined;
};

const readStateConditions = (state: SceneState): string[] => {
  const [keyword, written = ''] = state.label.split(/\s*=\s*/, 2);

  return UNCONDITIONED_STATE.test(keyword.trim())
    ? []
    : written.split(/\s+/).filter(Boolean).map((token) => token.toUpperCase());
};

const findBestState = (states: SceneState[], held: ReadonlySet<string>) => {
  let best: SceneState | undefined;
  let bestCount = -1;

  for (const state of states) {
    const conditions = readStateConditions(state);

    if (conditions.every((each) => held.has(each)) && conditions.length > bestCount) {
      best = state;
      bestCount = conditions.length;
    }
  }
  return best;
};

const listDrawStates = (scene: ObjectScene, draw: string): SceneState[] =>
  scene.states
    .filter((state) => state.draw === draw)
    .map((state) =>
      state.model && /^none$/i.test(state.model) ? { ...state, model: undefined } : state,
    );

export const pickDrawLook = (
  scene: ObjectScene,
  draw: string,
  held: readonly string[] = [],
): { model?: string; animation?: string } => {
  const conditions = new Set(held.map((each) => each.toUpperCase()));
  const own = listDrawStates(scene, draw);
  const modelState = findBestState(
    own.filter((state) => state.kind === 'model'),
    conditions,
  );
  const animationState =
    findBestState(
      own.filter((state) => state.kind === 'animation'),
      conditions,
    ) ?? modelState;

  return {
    model:
      modelState?.model ??
      animationState?.model ??
      own.find((state) => state.model)?.model,
    animation:
      animationState?.animations[0] ??
      modelState?.animations[0],
  };
};

interface DrawModule {
  block: SageBlock;
  tag: string;
  defaultModel?: string;
  isModelModule: boolean;
  isStartHidden: boolean;
  attachBone?: string;
}

const listDrawModules = (object: ComposableObject): DrawModule[] => {
  const block = findObjectBlock(object.parsed);

  return (block?.children ?? [])
    .filter((child) => lower(child.keyword) === 'draw')
    .map((child) => {
      const tag = child.moduleTag ?? child.moduleType ?? 'Draw';
      const fields = readOwnFields(object.parsed, child);
      const own = listDrawStates(object.scene, tag);

      return {
        block: child,
        tag,
        defaultModel: own.find(
          (state) => state.model && DEFAULT_STATE.test(state.label),
        )?.model,
        isModelModule: own.some((state) => state.model),
        isStartHidden: /^yes$/i.test(fields.get('starthidden')?.at(-1)?.[0] ?? ''),
        attachBone: fields.get('attachtoboneinanothermodule')?.at(-1)?.[0],
      };
    });
};

const findBody = (draws: DrawModule[]) =>
  draws.find((draw) => draw.defaultModel) ?? draws.find((draw) => draw.isModelModule);

const findHordeContain = (object: ComposableObject) =>
  findObjectBlock(object.parsed)?.children.find(
    (module) =>
      lower(module.keyword) === 'behavior' && HORDE_CONTAINS.test(module.moduleType ?? ''),
  );

interface RankLine {
  unitType: string;
  positions: { x: number; y: number }[];
}

const readKeyed = (token: string | undefined, key: string): string | undefined => {
  const at = token?.indexOf(':') ?? -1;

  return token && at > 0 && lower(token.slice(0, at)) === lower(key)
    ? token.slice(at + 1)
    : undefined;
};

const readAxis = (tokens: string[], at: number, key: string) => {
  const rest = readKeyed(tokens[at], key);

  if (rest === undefined) {
    return undefined;
  }

  const [text, next] = rest === '' ? [tokens[at + 1], at + 2] : [rest, at + 1];
  const value = Number(text);

  return text !== undefined && text !== '' && Number.isFinite(value)
    ? { value, next }
    : undefined;
};

export const readRankLine = (tokens: string[]): RankLine => {
  const line: RankLine = { unitType: '', positions: [] };

  for (let at = 0; at < tokens.length; ) {
    const unitType = readKeyed(tokens[at], 'UnitType');
    const position = readKeyed(tokens[at], 'Position');

    if (unitType !== undefined) {
      line.unitType = unitType || (tokens[at + 1] ?? '');
      at += unitType ? 1 : 2;
    } else if (position !== undefined) {
      const x = position === '' ? readAxis(tokens, at + 1, 'X') : readAxis([position, tokens[at + 1]], 0, 'X');
      const xNext = position === '' ? x?.next : x && at + x.next;
      const y = x && xNext !== undefined ? readAxis(tokens, xNext, 'Y') : undefined;

      if (!x || !y) {
        at += 1;
        continue;
      }
      line.positions.push({ x: x.value, y: y.value });
      at = lower(tokens[y.next] ?? '') === 'leader' ? y.next + 3 : y.next;
    } else {
      at += 1;
    }
  }
  return line;
};

const readPoint = (tokens: string[]) => {
  for (let at = 0; at < tokens.length; at++) {
    const token = tokens[at];
    const inner = readKeyed(token, 'Pos');
    const x = inner !== undefined && inner !== ''
      ? readAxis([inner], 0, 'X')
      : readAxis(tokens, at, 'X');
    const next = inner !== undefined && inner !== '' ? at + 1 : x?.next;
    const y = x && next !== undefined ? readAxis(tokens, next, 'Y') : undefined;

    if (x && y) {
      return { x: x.value, y: y.value };
    }
  }
  return undefined;
};

class Composer {
  readonly parts: ComposedPart[] = [];
  readonly notes: string[] = [];
  private readonly read = new Map<string, Promise<ComposableObject | undefined>>();
  private isOverBudget = false;
  private readonly idRepeats = new Map<string, number>();

  constructor(private readonly sources: CompositionSources) {}

  readObject(name: string): Promise<ComposableObject | undefined> {
    const key = lower(name);
    let found = this.read.get(key);

    if (!found) {
      found = this.sources.readObject(name).catch(() => undefined);
      this.read.set(key, found);
    }
    return found;
  }

  private isFull(): boolean {
    if (this.parts.length < MAX_COMPOSED_PARTS) {
      return false;
    }
    if (!this.isOverBudget) {
      this.notes.push(`Stopped at ${MAX_COMPOSED_PARTS} parts; the rest are left out`);
      this.isOverBudget = true;
    }
    return true;
  }

  private add(part: Omit<ComposedPart, 'id'>): ComposedPart | undefined {
    if (this.isFull()) {
      return undefined;
    }

    const { placement, source } = part;
    const where =
      placement.kind === 'passengerBone'
        ? `${placement.prefix}${placement.slot}`
        : placement.kind === 'slot'
          ? `${placement.x},${placement.y}`
          : placement.kind === 'attachBone'
            ? placement.bone
            : '';
    const base = [
      part.parent ?? '',
      source.owner,
      source.moduleTag ?? source.moduleType,
      source.field,
      part.draw ?? part.object ?? '',
      placement.kind,
      where,
    ]
      .join('|')
      .toLowerCase();
    const repeats = this.idRepeats.get(base) ?? 0;

    this.idRepeats.set(base, repeats + 1);

    const added = { id: repeats ? `${base}#${repeats}` : base, ...part };

    this.parts.push(added);
    return added;
  }

  async compose(
    object: ComposableObject,
    parent: string | undefined,
    chain: readonly string[],
    isRoot: boolean,
  ): Promise<void> {
    const draws = listDrawModules(object);
    const body = findBody(draws);

    const contains = (findObjectBlock(object.parsed)?.children ?? []).filter(
      (module) =>
        lower(module.keyword) === 'behavior' && CONTAIN.test(module.moduleType ?? ''),
    );

    this.addDrawModules(object, draws, body, parent, isRoot);
    if (contains.length && chain.length > MAX_COMPOSITION_DEPTH) {
      this.notes.push(
        `${object.name} is ${MAX_COMPOSITION_DEPTH} objects deep: what it holds is left out`,
      );
      return;
    }
    for (const module of contains) {
      if (HORDE_CONTAINS.test(module.moduleType ?? '')) {
        await this.addHordeMembers(object, module, parent, chain);
      } else {
        await this.addOccupants(object, module, parent, chain);
      }
    }
  }

  private addDrawModules(
    object: ComposableObject,
    draws: DrawModule[],
    body: DrawModule | undefined,
    parent: string | undefined,
    isRoot: boolean,
  ) {
    if (TREE_DRAW.test(body?.block.moduleType ?? '')) {
      return;
    }
    for (const draw of draws) {
      if (!draw.isModelModule || (!isRoot && draw === body)) {
        continue;
      }
      this.add({
        parent,
        source: {
          owner: object.name,
          moduleType: draw.block.moduleType ?? 'Draw',
          moduleTag: draw.block.moduleTag,
          field: 'Draw',
        },
        draw: draw.tag,
        ...pickDrawLook(object.scene, draw.tag),
        placement: draw.attachBone
          ? { kind: 'attachBone', bone: draw.attachBone }
          : { kind: 'origin' },
        isShown: !draw.isStartHidden,
        note: draw.isStartHidden
          ? `StartHidden: shown when an upgrade's ShowSubObjects names ${draw.tag}`
          : undefined,
      });
    }
  }

  private async readMember(name: string, chain: readonly string[], owner: string) {
    if (chain.includes(lower(name))) {
      this.notes.push(`${name} is reached again through ${owner}: not composed a second time`);
      return undefined;
    }

    const member = await this.readObject(name);

    if (!member) {
      this.notes.push(`${name}, named by ${owner}, is not defined anywhere indexed`);
    }
    return member;
  }

  private async addObject(
    member: ComposableObject,
    part: Omit<ComposedPart, 'id' | 'object' | 'model' | 'animation'>,
    held: readonly string[],
    chain: readonly string[],
  ) {
    const body = findBody(listDrawModules(member));
    const added = this.add({
      ...part,
      object: member.name,
      draw: undefined,
      ...(body ? pickDrawLook(member.scene, body.tag, held) : {}),
    });

    if (added) {
      await this.compose(member, added.id, [...chain, lower(member.name)], false);
    }
  }

  private async addOccupants(
    object: ComposableObject,
    module: SageBlock,
    parent: string | undefined,
    chain: readonly string[],
  ) {
    const fields = readOwnFields(object.parsed, module);
    const seats = (fields.get('passengerboneprefix') ?? []).flatMap((tokens) => {
      const prefix = tokens.map((token) => readKeyed(token, 'PassengerBone')).find(Boolean);
      const kind = tokens.map((token) => readKeyed(token, 'KindOf')).find(Boolean);

      return prefix ? [{ prefix, kind: kind?.toUpperCase(), taken: 0 }] : [];
    });
    const boneConditions = new Map<number, string[]>();

    for (const [number, ...conditions] of fields.get('bonespecificconditionstate') ?? []) {
      boneConditions.set(Number(number), conditions);
    }

    const entries = [
      ...(fields.get('initialcrew') ?? []).map((values) => ({ field: 'InitialCrew', values })),
      ...(fields.get('initialpayload') ?? []).map((values) => ({ field: 'InitialPayload', values })),
    ];
    const inside = new Map<string, number>();
    const source = (field: string): PartSource => ({
      owner: object.name,
      moduleType: module.moduleType ?? 'Contain',
      moduleTag: module.moduleTag,
      field,
    });
    const findSeat = (occupant: ComposableObject) => {
      const kinds = readKindOf(occupant.parsed);

      return seats.find((each) => !each.kind || kinds.includes(each.kind));
    };
    const seatOn = async (
      occupant: ComposableObject,
      seat: (typeof seats)[number],
      field: string,
    ) => {
      const slot = seat.taken++;

      await this.addObject(
        occupant,
        {
          parent,
          source: source(field),
          placement: { kind: 'passengerBone', prefix: seat.prefix, slot },
          isShown: true,
        },
        [
          ...(field === 'InitialCrew' ? [CREW_CONDITION] : []),
          ...(boneConditions.get(slot + 1) ?? []),
        ],
        chain,
      );
    };

    for (const { field, values } of entries) {
      const [name, written] = values;
      const count = Math.min(
        readCount(written ?? '1', this.sources.resolveMacro) ?? 1,
        MAX_COMPOSED_PARTS,
      );
      const occupant = name && (await this.readMember(name, chain, object.name));

      if (!occupant) {
        continue;
      }

      const hordeModule = findHordeContain(occupant);
      const horde = hordeModule && (await this.readHorde(occupant, hordeModule));
      const member =
        horde &&
        (await this.readMember(horde.memberName, [...chain, lower(occupant.name)], occupant.name));

      const seated = horde ? member : occupant;
      const perRound = horde ? horde.slots.length : 1;
      const seat = seated && findSeat(seated);

      if (seated && !seat) {
        if (this.parts.length < MAX_COMPOSED_PARTS) {
          inside.set(seated.name, (inside.get(seated.name) ?? 0) + count * perRound);
        }
        continue;
      }
      for (let at = 0; seated && seat && at < count && this.parts.length < MAX_COMPOSED_PARTS; at++) {
        for (let each = 0; each < perRound && !this.isFull(); each++) {
          await seatOn(seated, seat, field);
        }
      }
    }
    for (const [name, count] of inside) {
      this.notes.push(
        `${count} × ${name} (${module.moduleTag ?? module.moduleType}) ride inside ${object.name} with no passenger bone for them: not drawn`,
      );
    }
  }

  private async readHorde(object: ComposableObject, module: SageBlock) {
    const fields = readOwnFields(object.parsed, module);
    const ranks = (fields.get('rankinfo') ?? []).map(readRankLine);
    const declared = readCount(fields.get('slots')?.at(-1)?.[0], this.sources.resolveMacro);
    const slots = ranks
      .flatMap((rank) => rank.positions.map((position) => ({ ...position, unitType: rank.unitType })))
      .slice(0, Math.min(declared ?? Infinity, MAX_HORDE_SLOTS));
    const payload = fields.get('initialpayload') ?? [];
    const memberName =
      payload.length === 1 && payload[0][0]
        ? payload[0][0]
        : ranks.map((rank) => rank.unitType.trim()).find(Boolean);

    if (!slots.length || !memberName) {
      return undefined;
    }

    let centre: { x: number; y: number } | undefined;

    for (const slot of slots) {
      if (
        slot.unitType &&
        readKindOf((await this.readObject(slot.unitType))?.parsed).includes('MACHINE')
      ) {
        centre = slot;
        break;
      }
    }
    if (!centre) {
      const leader = (fields.get('leadersallowed') ?? []).some((line) => line.length)
        ? readPoint(fields.get('leaderposition')?.at(-1) ?? [])
        : undefined;
      const bannerLine = fields.get('bannercarrierposition')?.at(-1) ?? [];
      const bannerType = bannerLine.map((token) => readKeyed(token, 'UnitType')).find(Boolean);
      const banner =
        bannerType && (await this.readObject(bannerType)) ? readPoint(bannerLine) : undefined;
      const counted = [...slots, ...(leader ? [leader] : []), ...(banner ? [banner] : [])];

      centre = {
        x: counted.reduce((sum, each) => sum + each.x, 0) / counted.length,
        y: counted.reduce((sum, each) => sum + each.y, 0) / counted.length,
      };
    }

    const { x, y } = centre;

    return {
      memberName,
      field: payload.length === 1 ? 'InitialPayload' : 'RankInfo',
      slots: slots.map((slot) => ({ x: slot.x - x, y: slot.y - y })),
    };
  }

  private async addHordeMembers(
    object: ComposableObject,
    module: SageBlock,
    parent: string | undefined,
    chain: readonly string[],
  ) {
    const horde = await this.readHorde(object, module);
    const member = horde && (await this.readMember(horde.memberName, chain, object.name));

    for (const slot of member ? horde.slots : []) {
      if (this.isFull()) {
        break;
      }
      await this.addObject(
        member!,
        {
          parent,
          source: {
            owner: object.name,
            moduleType: module.moduleType ?? 'HordeContain',
            moduleTag: module.moduleTag,
            field: horde!.field,
          },
          placement: { kind: 'slot', ...slot },
          isShown: true,
        },
        [],
        chain,
      );
    }
  }
}

export const composeObject = async (
  object: ComposableObject,
  sources: CompositionSources,
): Promise<ObjectComposition> => {
  const composer = new Composer(sources);

  await composer.compose(object, undefined, [lower(object.name)], true);
  return { parts: composer.parts, notes: composer.notes };
};

export const describePartSource = (part: ComposedPart): string => {
  const { owner, moduleType, moduleTag, field } = part.source;
  const module = [moduleType, moduleTag].filter(Boolean).join(' ');

  return field === 'Draw'
    ? `${module} of ${owner}`
    : `${field} of ${module} in ${owner}`;
};
