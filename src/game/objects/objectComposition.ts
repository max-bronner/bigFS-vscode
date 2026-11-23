import type { SageBlock, SageDocument } from '../../formats/ini/sageIniParser';
import { isSubObjectNamed } from '../../formats/w3d/w3dScene';
import type { SubObjectRule } from '../../formats/w3d/w3dScene';
import type { TextureLayers } from '../../formats/w3d/w3dTextureSwaps';
import {
  SNOW_CONDITION,
  listAppearanceOptions,
  listHeldConditions,
  listTextureLayers,
  pickModelState,
} from './objectAppearance';
import type { AppearanceChoice, AppearanceOptions } from './objectAppearance';
import { groupStates } from './groupStates';
import { findIdleState, getDrawTag, readStateConditions } from './objectScene';
import type { ObjectScene, SceneState, SceneUpgrade } from './objectScene';
import { findBodyDraw, listWornRules, pickDrawShadow, pickPlayingClip, pickPlayingState, readStateModel } from './drawStates';
import type { DrawGate } from './drawStates';
import type { ObjectShadow } from './objectShadows';
import { listStateEffects } from './listStateEffects';
import type { ListedEffect } from './listStateEffects';
import { applyChange, bindDraw, bindSpawn, listSubObjectSwitches } from './partBindings';
import { readBlockFields } from './readBlockFields';
import { readObjectCreationList } from './objectCreationList';
import { walkUpgrades } from './walkUpgrades';
import type { PartBinding, SubObjectSwitch } from './partBindings';

export type PartPlacement =
  | { kind: 'origin' }
  | { kind: 'slot'; x: number; y: number }
  | { kind: 'offset'; x: number; y: number; z: number }
  | { kind: 'attachBone'; bone: string }
  | { kind: 'passengerBone'; prefix: string; slot: number }
  | { kind: 'spawnPoint'; prefix: string; slot: number };

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
  holdsLastFrame?: boolean;
  placement: PartPlacement;
  hasDetailModels?: boolean;
  textures?: TextureLayers;
  isFloor?: boolean;
  shadow?: ObjectShadow;
  binding?: PartBinding;
  subObjectSwitches?: SubObjectSwitch[];
  subObjectRules: SubObjectRule[];
  effects?: ListedEffect[];
  isShown: boolean;
  note?: string;
}

export interface PartStateOption {
  title: string;
  group: string;
  conditions: string[];
}

export type PartStatePicks = Readonly<Record<string, readonly string[]>>;

export interface ObjectComposition {
  parts: ComposedPart[];
  notes: string[];
  appearance?: AppearanceOptions;
  partStates?: Record<string, PartStateOption[]>;
}

export interface ComposableObject {
  name: string;
  parsed: SageDocument;
  scene: ObjectScene;
}

export interface CompositionSources {
  readObject(name: string): Promise<ComposableObject | undefined>;
  resolveMacro?(name: string): string | undefined;
  readCreationList?(name: string): Promise<readonly string[] | undefined>;
  listSubObjects?(model: string): Promise<readonly string[] | undefined>;
}

export const MAX_COMPOSED_PARTS = 64;
export const MAX_COMPOSITION_DEPTH = 3;
export const MAX_SPAWN_POINTS = 10;
const MAX_PART_STATES = 64;
const MAX_HORDE_SLOTS = 1024;

const HORDE_CONTAINS = /^(hordecontain|horsehordecontain|aodhordecontain)$/i;
const CONTAIN = /contain$/i;
const TREE_DRAW = /^w3dtreedraw$/i;
const FLOOR_DRAW = /^w3dfloordraw$/i;
const CREW_CONDITION = 'PASSENGER';


const findObjectBlock = (parsed: SageDocument) =>
  parsed.blocks.find((block) =>
    /^(object|childobject|objectreskin)$/i.test(block.keyword),
  );

export const readKindOf = (parsed: SageDocument | undefined): string[] => {
  const object = parsed && findObjectBlock(parsed);
  const lines = parsed && object ? readBlockFields(parsed, object).get('kindof') : undefined;

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
  const own = scene.states.filter((state) => state.draw === draw);
  const modelState = pickModelState(own, new Set(held.map((each) => each.toUpperCase())));

  return {
    model: readStateModel(modelState) ?? own.map(readStateModel).find(Boolean),
    animation: pickPlayingClip(scene, draw, held) ?? modelState?.animations[0],
  };
};

const listDrawAppearance = (
  scene: ObjectScene,
  draw: string,
  held: readonly string[],
  choice: AppearanceChoice,
) => {
  const own = scene.states.filter((state) => state.draw === draw);
  const modelState = pickModelState(own, new Set(held.map((each) => each.toUpperCase())));
  const textures = listTextureLayers(scene, draw, modelState, choice);
  const playing = pickPlayingState(scene, draw, held);
  const switches = listSubObjectSwitches(scene, choice.upgrades);
  const shadow = pickDrawShadow(scene, draw, modelState);
  const effects = listStateEffects({ ...scene, fx: [] }, modelState, playing, held).playing;

  return {
    ...(shadow ? { shadow } : {}),
    ...(effects.length ? { effects } : {}),
    ...pickDrawLook(scene, draw, held),
    ...(playing?.animations.length && playing.startsAtLastFrame && playing.playsOnce
      ? { holdsLastFrame: true }
      : {}),
    ...(textures.length ? { textures } : {}),
    ...(scene.detailDraws?.includes(draw) ? { hasDetailModels: true } : {}),
    ...(switches.length ? { subObjectSwitches: switches } : {}),
    subObjectRules: listWornRules(
      scene,
      modelState ?? findIdleState(scene, draw),
      playing,
      held,
      choice.upgrades,
    ),
  };
};

interface DrawModule extends DrawGate {
  block: SageBlock;
  isModelModule: boolean;
  attachBone?: string;
  floorModel?: string;
  snowTexture?: string;
}

const listDrawModules = (object: ComposableObject): DrawModule[] => {
  const block = findObjectBlock(object.parsed);

  return (block?.children ?? [])
    .filter((child) => child.keyword.toLowerCase() === 'draw')
    .map((child) => {
      const tag = getDrawTag(child);
      const fields = readBlockFields(object.parsed, child);
      const own = listDrawStates(object.scene, tag);
      const isFloor = FLOOR_DRAW.test(child.moduleType ?? '');
      const snowTexture = fields
        .get('weathertexture')
        ?.find(([weather]) => (weather ?? '').toLowerCase() === 'snowy')?.[1];

      return {
        block: child,
        tag,
        isFloor,
        floorModel: isFloor ? fields.get('modelname')?.at(-1)?.[0] : undefined,
        snowTexture,
        isModelModule: own.some((state) => state.model),
        isStartHidden: /^yes$/i.test(fields.get('starthidden')?.at(-1)?.[0] ?? ''),
        hiddenByConditions: (fields.get('hideifmodelconditions') ?? [])
          .flat()
          .map((each) => each.toUpperCase()),
        attachBone: fields.get('attachtoboneinanothermodule')?.at(-1)?.[0],
      };
    });
};

const findBody = (draws: DrawModule[], scene: ObjectScene) => {
  const tag = findBodyDraw(scene);

  return draws.find((draw) => draw.tag === tag);
};

const findHordeContain = (object: ComposableObject) =>
  findObjectBlock(object.parsed)?.children.find(
    (module) =>
      module.keyword.toLowerCase() === 'behavior' && HORDE_CONTAINS.test(module.moduleType ?? ''),
  );

interface RankLine {
  unitType: string;
  positions: { x: number; y: number }[];
}

const readKeyed = (token: string | undefined, key: string): string | undefined => {
  const at = token?.indexOf(':') ?? -1;

  return token && at > 0 && token.slice(0, at).toLowerCase() === key.toLowerCase()
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
      at = (tokens[y.next] ?? '').toLowerCase() === 'leader' ? y.next + 3 : y.next;
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
  readonly scenes = new Set<ObjectScene>();
  private readonly objectsRead = new Map<string, Promise<ComposableObject | undefined>>();
  readonly partStates: Record<string, PartStateOption[]> = {};
  private isOverBudget = false;
  private readonly idRepeats = new Map<string, number>();
  private readonly groupOfPart = new Map<string, string>();

  constructor(
    private readonly sources: CompositionSources,
    private readonly shownConditions: readonly string[],
    private readonly choice: AppearanceChoice,
    private readonly picks: PartStatePicks = {},
  ) {}

  private getGroup(part: Pick<ComposedPart, 'parent' | 'object' | 'draw' | 'model' | 'source'>): string {
    const parent = part.parent === undefined ? undefined : this.groupOfPart.get(part.parent);

    return getPartGroupKey(parent, part.object ?? part.draw ?? part.model ?? '', describePartSource(part));
  }

  private takePick(group: string, scene: ObjectScene, draw: string | undefined): readonly string[] {
    if (draw !== undefined && !(group in this.partStates)) {
      const own = scene.states.filter((state) => state.draw === draw);
      const options = groupStates(own).flatMap(({ title: purpose, states }) =>
        purpose === 'Transitions'
          ? []
          : states.map(({ state, title }) => ({
              title,
              group: purpose,
              conditions: readStateConditions(state).filter((each) => each !== 'NONE'),
            })),
      );

      if (options.length > 1) {
        this.partStates[group] = options.slice(0, MAX_PART_STATES);
      }
    }
    return this.picks[group] ?? [];
  }

  readObject(name: string): Promise<ComposableObject | undefined> {
    const key = name.toLowerCase();
    let found = this.objectsRead.get(key);

    if (!found) {
      found = this.sources.readObject(name).catch(() => undefined);
      this.objectsRead.set(key, found);
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
      placement.kind === 'passengerBone' || placement.kind === 'spawnPoint'
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

    this.groupOfPart.set(added.id, this.getGroup(added));
    this.parts.push(added);
    return added;
  }

  async compose(
    object: ComposableObject,
    parent: string | undefined,
    chain: readonly string[],
    isRoot: boolean,
    conditions: readonly string[] = [],
  ): Promise<void> {
    const draws = listDrawModules(object);
    const body = findBody(draws, object.scene);

    this.scenes.add(object.scene);

    const contains = (findObjectBlock(object.parsed)?.children ?? []).filter(
      (module) =>
        module.keyword.toLowerCase() === 'behavior' && CONTAIN.test(module.moduleType ?? ''),
    );

    this.addDrawModules(object, draws, body, parent, isRoot, conditions);
    if (isRoot) {
      await this.addSpawned(object, chain);
      await this.addPopulation(object, chain);
      await this.addListed(object, chain);
    }
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
    conditions: readonly string[],
  ) {
    if (TREE_DRAW.test(body?.block.moduleType ?? '')) {
      return;
    }

    const { scene } = object;
    const choice = {
      ...this.choice,
      conditions: [...(isRoot ? this.shownConditions : conditions)],
    };

    for (const draw of draws) {
      const isFloor = draw.isFloor && !!draw.floorModel;

      if (!isFloor && (!draw.isModelModule || (!isRoot && draw === body))) {
        continue;
      }

      const bound = bindDraw(scene, draw, choice);
      const stands = bound.isShown ? undefined : bound.binding.show;
      const source = {
        owner: object.name,
        moduleType: draw.block.moduleType ?? 'Draw',
        moduleTag: draw.block.moduleTag,
        field: 'Draw',
      };
      const picked = isFloor
        ? []
        : this.takePick(this.getGroup({ parent, draw: draw.tag, source }), scene, draw.tag);
      const worn = stands ? applyChange(choice, stands) : choice;
      const held = [...new Set([...listHeldConditions(scene, worn), ...picked])];
      const look = isFloor
        ? {
            model: draw.floorModel,
            isFloor: true,
            subObjectRules: [],
            ...(choice.isSnowy && draw.snowTexture
              ? { textures: [[{ to: draw.snowTexture }]] }
              : {}),
          }
        : listDrawAppearance(scene, draw.tag, held, worn);

      this.add({
        parent,
        source,
        draw: draw.tag,
        ...look,
        placement: draw.attachBone
          ? { kind: 'attachBone', bone: draw.attachBone }
          : { kind: 'origin' },
        isShown: draw === body || bound.isShown,
        binding: bound.binding,
        note: draw.isStartHidden
          ? `StartHidden: shown when an upgrade's ShowSubObjects names ${draw.tag}`
          : undefined,
      });
    }
  }

  private async addSpawned(object: ComposableObject, chain: readonly string[]) {
    const { scene } = object;
    const spawns = new Map<string, SceneUpgrade[]>();

    for (const module of scene.upgrades) {
      if (module.spawns && !module.population) {
        const key = `${module.spawns.toLowerCase()}|${(module.offset ?? []).join(',')}`;

        spawns.set(key, [...(spawns.get(key) ?? []), module]);
      }
    }
    for (const modules of spawns.values()) {
      if (this.isFull()) {
        break;
      }

      const spawned = await this.readMember(modules[0].spawns!, chain, object.name);

      if (!spawned) {
        continue;
      }

      const [x, y, z] = modules[0].offset ?? [0, 0, 0];
      const unbuilt = this.findUnbuiltVariation(scene);

      if (unbuilt) {
        this.notes.push(
          `${spawned.name} stands at the Offset written for ${scene.padVariation}, which every plot that builds ${object.name} gives: the game never shows it in ${unbuilt}`,
        );
      }
      await this.addObject(
        spawned,
        {
          source: {
            owner: object.name,
            moduleType: 'ObjectCreationUpgrade',
            field: 'ThingToSpawn',
          },
          placement: { kind: 'offset', x, y, z },
          ...bindSpawn(scene, modules, this.choice.upgrades),
        },
        this.shownConditions,
        chain,
      );
    }
  }

  private async addPopulation(object: ComposableObject, chain: readonly string[]) {
    const { scene } = object;

    for (const module of scene.upgrades) {
      const { population } = module;

      if (!population?.names.length) {
        continue;
      }
      if (!scene.spawnPointBone) {
        this.notes.push(
          `${population.names.join(', ')}, which ${population.moduleTag ?? 'a SpawnBehavior'} of ${object.name} creates, walks out of it: not drawn`,
        );
        continue;
      }

      const bound = bindSpawn(scene, [module], this.choice.upgrades);
      const count = Math.min(population.count, MAX_SPAWN_POINTS);

      for (let slot = 0; slot < count && !this.isFull(); slot++) {
        const name = population.names[slot % population.names.length];
        const spawned = await this.readMember(name, chain, object.name);

        if (!spawned) {
          break;
        }
        await this.addObject(
          spawned,
          {
            source: {
              owner: object.name,
              moduleType: 'SpawnBehavior',
              moduleTag: population.moduleTag,
              field: 'SpawnTemplateName',
            },
            placement: { kind: 'spawnPoint', prefix: scene.spawnPointBone, slot },
            ...bound,
          },
          [],
          chain,
        );
      }
    }
  }

  private async addListed(object: ComposableObject, chain: readonly string[]) {
    const { scene } = object;
    const picked = this.choice.upgrades ?? [];
    const { active } = walkUpgrades(scene, picked);
    const { active: fromCreation } = walkUpgrades(scene);
    const holdsAny = (names: readonly string[], held: ReadonlySet<string>) =>
      names.some((name) => held.has(name.toLowerCase()));

    for (const { name: list, moduleTag } of scene.updateCreationLists ?? []) {
      const lines = this.isFull() ? undefined : await this.sources.readCreationList?.(list);

      if (!lines) {
        continue;
      }
      for (const nugget of readObjectCreationList(lines)) {
        const [name, ...others] = nugget.names;
        const isGated = !!nugget.requiredUpgrades.length;
        const canStand = (held: ReadonlySet<string>) =>
          (!isGated || holdsAny(nugget.requiredUpgrades, held)) &&
          !holdsAny(nugget.forbiddenUpgrades, held);
        const created = !this.isFull() && (await this.readMember(name, chain, object.name));

        if (!created) {
          continue;
        }
        if (others.length || nugget.count > 1) {
          this.notes.push(
            `${list} creates ${nugget.count} of ${nugget.names.join(', ')}: one ${name} is drawn`,
          );
        }

        const [x, y, z] = nugget.offset;
        const isShown = canStand(active);
        const isAlways = canStand(fromCreation);
        const listPicked = (names: readonly string[]) =>
          names.filter((each) => picked.some((given) => given.toLowerCase() === each.toLowerCase()));
        const give = isGated && !holdsAny(nugget.requiredUpgrades, active) ? nugget.requiredUpgrades.slice(0, 1) : [];
        const take = listPicked(nugget.forbiddenUpgrades);
        const show =
          isShown || (!give.length && !take.length)
            ? undefined
            : { ...(give.length ? { give } : {}), ...(take.length ? { take } : {}) };
        const hide = isShown && !isAlways ? { take: listPicked(nugget.requiredUpgrades) } : undefined;

        await this.addObject(
          created,
          {
            source: { owner: object.name, moduleType: 'OCLUpdate', moduleTag, field: 'OCL' },
            placement: { kind: 'offset', x, y, z },
            isShown,
            binding: {
              role: isAlways ? 'always' : isGated ? 'upgrade' : 'state',
              ...(isAlways || !isGated ? {} : { addedBy: { give: nugget.requiredUpgrades.slice(0, 1) } }),
              ...(show ? { show } : {}),
              ...(hide?.take.length ? { hide } : {}),
            },
          },
          this.shownConditions,
          chain,
        );
      }
    }
  }

  private findUnbuiltVariation(scene: ObjectScene): string | undefined {
    const pad = scene.padVariation;

    return pad
      ? this.shownConditions.find((each) => /^BUILD_VARIATION_/i.test(each) && each.toUpperCase() !== pad)
      : undefined;
  }

  private async readMember(name: string, chain: readonly string[], owner: string) {
    if (chain.includes(name.toLowerCase())) {
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
    part: Omit<ComposedPart, 'id' | 'object' | 'model' | 'animation' | 'subObjectRules'>,
    conditions: readonly string[],
    chain: readonly string[],
  ) {
    const body = findBody(listDrawModules(member), member.scene);
    const picked = this.takePick(this.getGroup({ ...part, object: member.name }), member.scene, body?.tag);
    const own = [...new Set([...conditions, ...picked])];
    const held = listHeldConditions(member.scene, {
      upgrades: this.choice.upgrades,
      conditions: [...own, ...(this.choice.isSnowy ? [SNOW_CONDITION] : [])],
    });
    const added = this.add({
      ...part,
      object: member.name,
      draw: undefined,
      subObjectRules: [],
      ...(body ? listDrawAppearance(member.scene, body.tag, held, this.choice) : {}),
    });

    if (added) {
      await this.compose(member, added.id, [...chain, member.name.toLowerCase()], false, own);
    }
  }

  private async addOccupants(
    object: ComposableObject,
    module: SageBlock,
    parent: string | undefined,
    chain: readonly string[],
  ) {
    const fields = readBlockFields(object.parsed, module);
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
          ...(field === 'InitialCrew' && parent === undefined ? this.shownConditions : []),
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
        (await this.readMember(horde.memberName, [...chain, occupant.name.toLowerCase()], occupant.name));

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
    const fields = readBlockFields(object.parsed, module);
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
      centre: { x, y },
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
    if (horde) {
      await this.addBanner(object, module, parent, chain, horde);
    }
  }

  private async addBanner(
    object: ComposableObject,
    module: SageBlock,
    parent: string | undefined,
    chain: readonly string[],
    horde: { memberName: string; centre: { x: number; y: number } },
  ) {
    const fields = readBlockFields(object.parsed, module);
    const name = fields.get('bannercarriersallowed')?.at(-1)?.[0];
    const lines = fields.get('bannercarrierposition') ?? [];
    const at = readPoint(
      lines.find((line) =>
        line.some(
          (token) => (readKeyed(token, 'UnitType') ?? '').toLowerCase() === horde.memberName.toLowerCase(),
        ),
      ) ??
        lines.at(-1) ??
        [],
    );

    if (!name || !at || /^none$/i.test(name) || this.isFull()) {
      return;
    }

    const carrier = await this.readMember(name, chain, object.name);

    if (!carrier) {
      return;
    }

    const min = object.scene.bannerLevel ?? 1;
    const table = object.scene.levels ?? [];
    const reached = parent === undefined ? (this.choice.level ?? 0) : 0;
    const isReachable = parent === undefined && min > 0 && min < table.length;
    const isShown = reached >= min;

    await this.addObject(
      carrier,
      {
        parent,
        source: {
          owner: object.name,
          moduleType: module.moduleType ?? 'HordeContain',
          moduleTag: module.moduleTag,
          field: 'BannerCarriersAllowed',
        },
        placement: { kind: 'slot', x: at.x - horde.centre.x, y: at.y - horde.centre.y },
        isShown,
        note:
          min && !isReachable
            ? `BannerCarrierMinLevel ${min}: a level this horde does not reach by itself`
            : undefined,
        binding: {
          role: !min ? 'always' : isReachable ? 'upgrade' : 'state',
          ...(isReachable ? { addedBy: { level: min } } : {}),
          ...(isReachable && !isShown ? { show: { level: min } } : {}),
          ...(isReachable && isShown ? { hide: { belowLevel: min } } : {}),
        },
      },
      [],
      chain,
    );
  }
}

export const composeObject = async (
  object: ComposableObject,
  sources: CompositionSources,
  shownConditions: readonly string[] = [],
  choice: AppearanceChoice = {},
  picks: PartStatePicks = {},
): Promise<ObjectComposition> => {
  const composer = new Composer(
    sources,
    [...shownConditions, ...(choice.conditions ?? [])],
    choice,
    picks,
  );

  await composer.compose(object, undefined, [object.name.toLowerCase()], true);

  const scenes = [...composer.scenes];
  const subObjects = sources.listSubObjects
    ? new Map(
        await Promise.all(
          scenes.map(async (scene) => [scene, await listSceneSubObjects(scene, sources)] as const),
        ),
      )
    : undefined;

  return {
    parts: composer.parts,
    notes: composer.notes,
    ...(Object.keys(composer.partStates).length ? { partStates: composer.partStates } : {}),
    appearance: listAppearanceOptions(
      scenes,
      subObjects && ((scene, pattern) => namesSubObject(scene, subObjects.get(scene), pattern)),
    ),
  };
};

const listSceneSubObjects = async (
  scene: ObjectScene,
  sources: CompositionSources,
): Promise<readonly string[] | undefined> => {
  const models = new Map(
    scene.states.flatMap((state) => {
      const model = readStateModel(state);

      return model ? [[model.toLowerCase(), model] as const] : [];
    }),
  );
  const lists = await Promise.all(
    [...models.values()].map((model) => sources.listSubObjects?.(model)),
  );

  return lists.some((list) => !list) ? undefined : lists.flatMap((list) => list ?? []);
};

const namesSubObject = (
  scene: ObjectScene,
  subObjects: readonly string[] | undefined,
  pattern: string,
): boolean | undefined => {
  if (
    [...scene.states, ...(scene.cliplessStates ?? [])].some(
      (state) => state.draw.toLowerCase() === pattern.toLowerCase(),
    )
  ) {
    return true;
  }
  return subObjects?.some((name) => {
    const at = name.indexOf('.');

    return isSubObjectNamed(
      at < 0 ? { container: '', name } : { container: name.slice(0, at), name: name.slice(at + 1) },
      pattern,
    );
  });
};

export const describePartSource = (part: Pick<ComposedPart, 'source'>): string => {
  const { owner, moduleType, moduleTag, field } = part.source;
  const module = [moduleType, moduleTag].filter(Boolean).join(' ');

  return field === 'Draw'
    ? `${module} of ${owner}`
    : `${field} of ${module} in ${owner}`;
};

export const getPartGroupKey = (parent: string | undefined, name: string, source: string): string =>
  [parent ?? '', name, source].join('|').toLowerCase();
