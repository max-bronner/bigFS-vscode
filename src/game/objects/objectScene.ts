import { readWheelField } from './truckWheels';
import type { TruckWheels } from './truckWheels';
import { readShadowField } from './objectShadows';
import type { ShadowFields } from './objectShadows';
import type { SageBlock, SageDocument, SageStatement } from '../../formats/ini/sageIniParser';
import { getAudioReferenceKind } from '../../formats/ini/sageAudioFields';
import type { SageIniSchema } from '../../formats/ini/sageIniSchema';
import type { SubObjectRule } from '../../formats/w3d/w3dScene';
import type { TextureSwap } from '../../formats/w3d/w3dTextureSwaps';
import type { LevelRung } from './creationUpgrades';
import { getEffectConditions } from './objectEffects';
import type { ObjectEffect } from './objectEffects';
import { readStateScript } from './subObjectScripts';
import type { CreatedSubObjects, ScriptedSubObjects } from './subObjectScripts';

export type StateKind = 'model' | 'animation';

export interface SceneState {
  draw: string;
  kind: StateKind;
  label: string;
  name?: string;
  line?: number;
  shadow?: ShadowFields;
  isImplied?: boolean;
  model?: string;
  retainsSubObjects?: boolean;
  startsAtLastFrame?: boolean;
  playsOnce?: boolean;
  animations: string[];
  fx: string[];
  fxEvents?: { name: string; frame: number }[];
  particles: { bone: string; system: string }[];
  textures?: TextureSwap[];
  subObjects: ScriptedSubObjects;
}

export interface SceneUpgrade {
  triggers: string[];
  shows: string[];
  hides: string[];
  startsActive: boolean;
  waitsBeforeShowing: boolean;
  conflicts?: string[];
  requiresAllTriggers?: boolean;
  textures?: TextureSwap[];
  excludes?: string[];
  addsConditions?: string[];
  removesConditions?: string[];
  weaponSetFlag?: string;
  raisesTemporarily?: string[];
  grants?: string[];
  spawns?: string;
  offset?: [number, number, number];
  population?: SpawnPopulation;
}

export interface SpawnPopulation {
  moduleTag?: string;
  names: string[];
  count: number;
}

export interface CreationGrant {
  name: string;
  isOnCompletion: boolean;
}

export interface RandomTexture {
  draw: string;
  index: string;
  from: string;
  to: string;
}

export interface SceneFloor {
  model?: string;
  snowTexture?: string;
}

export type BodyDamageState = 'pristine' | 'damaged' | 'reallydamaged' | 'rubble';

export interface ObjectScene {
  name: string;
  states: SceneState[];
  fx: ObjectEffect[];
  voices: { field: string; name: string; module?: string }[];
  upgrades: SceneUpgrade[];
  randomTextures?: RandomTexture[];
  detailDraws?: string[];
  cliplessStates?: SceneState[];
  floors?: SceneFloor[];
  damageSubObjects: Record<BodyDamageState, SubObjectRule[]>;
  luaEventLists: string[];
  created: CreatedSubObjects;
  heldUpgrades: string[];
  creationGrants?: CreationGrant[];
  updateCreationLists?: { name: string; moduleTag?: string }[];
  levels?: LevelRung[];
  commandSets?: string[];
  side?: string;
  shadow?: ShadowFields;
  wheels?: TruckWheels;
  speed?: string;
  sun?: [number, number, number];
  bannerLevel?: number;
  upgradeNeeds?: Record<string, string[]>;
  padVariation?: string;
  spawnPointBone?: string;
}

export interface SceneFocus {
  state?: number;
  animation?: string;
  fx?: string;
  system?: string;
}


const MODEL_FIELDS = new Set(['model']);
const ANIMATION_FIELDS = new Set(['animation', 'animationname']);
const DEFAULT_STATE = /^default/i;
const UNCONDITIONED_STATE = /^(default\w*|idleanimationstate)$/i;
const LOOK_UPGRADE = /^(subobjects|modelcondition|weaponset|objectcreation|castle)upgrade$/i;
const GRANT_AT_CREATION = /^grantupgradecreate$/i;
const CREATION_LIST_UPDATE = /^oclupdate$/i;
const SPAWN_BEHAVIOR = /^spawnbehavior$/i;
const SPAWN_POINT_EXIT = /^spawnpointproductionexitupdate$/i;
const FLOOR_DRAW = /^w3dfloordraw$/i;
const TRUCK_DRAW = /^w3dtruckdraw$/i;
const MODEL_STATE = /^(default)?(model)?conditionstate$/i;
const UPGRADE_MIXIN = /upgrade$|^dynamicportalbehaviou?r$/i;
const DEFAULT_WEAPON_SET_FLAG = 'PLAYER_UPGRADE';
const IDLE_STATE = /^idleanimationstate/i;
const PHASE = /^(initial|delay|burst|midpoint|final|almostfinal)$/i;
const FX_FIELD = /fx/i;
const SYSTEM_FIELD = /particlesys/i;
const SETTINGS_BLOCK = /^lodoptions$/i;
const ANIMATION_STATE = /^(idle)?animationstate$/i;
const DAMAGE_FIELD = /^(pristine|damaged|reallydamaged|rubble)(hide|show)subobject$/;

export const getDrawTag = (draw: SageBlock): string => draw.moduleTag ?? draw.moduleType ?? 'Draw';

export const readStateConditions = (state: SceneState): string[] => {
  const [keyword, written = ''] = state.label.split(/\s*=\s*/, 2);

  return UNCONDITIONED_STATE.test(keyword.trim())
    ? []
    : written.split(/\s+/).filter(Boolean).map((token) => token.toUpperCase());
};

const inheritTextures = (states: readonly SceneState[]) => {
  const defaults = new Map<string, TextureSwap[]>();

  for (const state of states.filter((each) => each.kind === 'model')) {
    const own = new Map<string, TextureSwap>();
    const isConditioned = readStateConditions(state).some((each) => each !== 'NONE');
    const inherited = isConditioned ? (defaults.get(state.draw) ?? []) : [];

    for (const swap of [...inherited, ...(state.textures ?? [])]) {
      const key = swap.from!.toLowerCase();

      own.delete(key);
      own.set(key, swap);
    }
    if (own.size) {
      state.textures = [...own.values()];
    }
    if (!isConditioned) {
      defaults.set(state.draw, [...own.values()]);
    }
  }
};

export const findIdleState = (
  scene: ObjectScene,
  draw: string,
): SceneState | undefined =>
  scene.states.find((state) => state.draw === draw && IDLE_STATE.test(state.label));

export const findOpeningAnimation = (
  scene: ObjectScene,
  draw: string | undefined,
): string | undefined =>
  (
    (draw === undefined ? undefined : findIdleState(scene, draw)) ??
    scene.states.find((state) => IDLE_STATE.test(state.label))
  )?.animations[0];

const stripKey = (value: string) => value.slice(value.indexOf(':') + 1);

const readRaisedAnimation = (values: readonly string[]) => {
  const text = values.join(' ');
  const condition = /\bAnimState:\s*(\w+)/i.exec(text)?.[1].toUpperCase();
  const time = /\bAnimTime:\s*(\d+)/i.exec(text)?.[1];

  return condition && time !== undefined ? { condition, isHeld: Number(time) === 0 } : undefined;
};

const readOffset = (values: readonly string[]): [number, number, number] =>
  ['x', 'y', 'z'].map((axis) => {
    const at = values.findIndex((value) => value.toLowerCase().startsWith(`${axis}:`));
    const number = at < 0 ? 0 : Number.parseFloat(stripKey(values[at]) || values[at + 1]);

    return Number.isFinite(number) ? number : 0;
  }) as [number, number, number];

const readFrame = (values: readonly string[]) => {
  const at = values.findIndex((value) => /^frame:/i.test(value));

  return at < 0 ? 0 : Math.max(0, Number(stripKey(values[at]) || values[at + 1]) || 0);
};

const findBlockChain = (blocks: readonly SageBlock[], line: number): SageBlock[] => {
  const chain: SageBlock[] = [];

  for (
    let level = blocks.find((b) => b.startLine <= line && line <= b.endLine);
    level;
    level = level.children.find((b) => b.startLine <= line && line <= b.endLine)
  ) {
    chain.push(level);
  }
  return chain;
};

const namesFx = (schema: SageIniSchema, statement: SageStatement) =>
  schema
    .getReferenceNamespaces(statement.keyword.text, statement.context)
    .includes('FXList');

const formatBlockHeader = (block: SageBlock) =>
  [block.keyword, block.name].filter(Boolean).join(' = ');

const findDrawPlace = (blocks: readonly SageBlock[], line: number) => {
  const chain = findBlockChain(blocks, line);
  const at = chain.findIndex((block) => block.keyword.toLowerCase() === 'draw');

  return at < 0
    ? { draw: undefined, state: undefined }
    : { draw: chain[at], state: chain.at(at + 1) };
};

const listMovingStates = (scene: ObjectScene): SceneState[] => {
  const { wheels } = scene;

  if (!wheels?.bones.length) {
    return [];
  }

  const own = scene.states.filter(
    (state) =>
      state.draw === wheels.draw &&
      state.kind === 'animation' &&
      !/^transitionstate/i.test(state.label),
  );
  const getKey = (state: SceneState) =>
    readStateConditions(state)
      .filter((each) => each !== 'NONE')
      .sort()
      .join(' ');
  const find = (conditions: string) => own.find((state) => getKey(state) === conditions);
  const added: SceneState[] = [];
  let playsThen = find('');

  for (const [key, header] of [
    ['MOVING', 'MOVING'],
    ['BACKING_UP MOVING', 'MOVING BACKING_UP'],
  ]) {
    const written = find(key);

    if (written) {
      playsThen = written;
      continue;
    }

    const scripted = scene.cliplessStates?.find(
      (state) => state.draw === wheels.draw && getKey(state) === key,
    );
    const state: SceneState = {
      animations: [],
      fx: [],
      particles: [],
      subObjects: { rules: [], conditional: [] },
      ...playsThen,
      ...(scripted ? { subObjects: scripted.subObjects, line: scripted.line } : {}),
      draw: wheels.draw,
      kind: 'animation',
      label: `AnimationState = ${header}`,
      isImplied: true,
    };

    added.push(state);
    playsThen = state;
  }
  return added;
};

export const readObjectScene = (
  parsed: SageDocument,
  schema: SageIniSchema,
  isFx: (name: string) => boolean,
  isSystem: (name: string) => boolean,
  lines: readonly string[] = [],
): ObjectScene | undefined => {
  const object = parsed.blocks.find((block) =>
    /^(object|childobject|objectreskin)$/i.test(block.keyword),
  );

  if (!object) {
    return undefined;
  }

  const states = new Map<SageBlock, SceneState>();
  const scene: ObjectScene = {
    name: object.name?.split(/\s+/)[0] ?? '',
    states: [],
    fx: [],
    voices: [],
    upgrades: [],
    damageSubObjects: { pristine: [], damaged: [], reallydamaged: [], rubble: [] },
    luaEventLists: [],
    created: { rules: [], conditional: [], grantedUpgrades: [] },
    heldUpgrades: [],
  };
  const upgrades = new Map<SageBlock, SceneUpgrade>();
  const grants = new Map<SageBlock, CreationGrant>();
  const floors = new Map<SageBlock, SceneFloor>();
  const upgradeOf = (block: SageBlock) => {
    let upgrade = upgrades.get(block);

    if (!upgrade) {
      upgrade = {
        triggers: [],
        shows: [],
        hides: [],
        startsActive: false,
        waitsBeforeShowing: false,
      };
      if ((block.moduleType ?? '').toLowerCase() === 'weaponsetupgrade') {
        upgrade.weaponSetFlag = DEFAULT_WEAPON_SET_FLAG;
      }
      upgrades.set(block, upgrade);
      scene.upgrades.push(upgrade);
    }
    return upgrade;
  };
  const stateOf = (draw: SageBlock, block: SageBlock) => {
    let state = states.get(block);

    if (!state) {
      state = {
        draw: getDrawTag(draw),
        kind: /animation|^transitionstate/i.test(block.keyword) ? 'animation' : 'model',
        label: formatBlockHeader(block),
        line: block.startLine,
        animations: [],
        fx: [],
        particles: [],
        subObjects: { rules: [], conditional: [] },
      };
      states.set(block, state);
      scene.states.push(state);
    }
    return state;
  };

  const locomotorSets = new Map<SageBlock, { condition?: string; speed?: string }>();
  const animatingUpgrades = new Set(
    parsed.statements.flatMap((statement) =>
      statement.kind === 'field' &&
      statement.line > object.startLine &&
      statement.line < object.endLine &&
      statement.keyword.text.toLowerCase() === 'customanimandduration'
        ? findBlockChain(parsed.blocks, statement.line).filter((block) =>
            UPGRADE_MIXIN.test(block.moduleType ?? ''),
          )
        : [],
    ),
  );

  for (const statement of parsed.statements) {
    if (
      statement.kind !== 'field' ||
      statement.line <= object.startLine ||
      statement.line >= object.endLine ||
      !statement.values.length
    ) {
      continue;
    }

    const key = statement.keyword.text.toLowerCase();
    const values = statement.values.map((value) => value.text);
    const { draw, state } = findDrawPlace(parsed.blocks, statement.line);
    const owner =
      draw && state && !SETTINGS_BLOCK.test(state.keyword) ? stateOf(draw, state) : undefined;

    if (key === 'ailuaeventslist') {
      scene.luaEventLists.push(values[0]);
      continue;
    }
    if (key === 'commandset') {
      (scene.commandSets ??= []).push(values[0]);
      continue;
    }
    if (key === 'side' && !draw) {
      scene.side ??= values[0];
      continue;
    }
    if (draw && !state && TRUCK_DRAW.test(draw.moduleType ?? '')) {
      const wheels = readWheelField(
        scene.wheels,
        getDrawTag(draw),
        key,
        values[0],
      );

      if (wheels) {
        scene.wheels = wheels;
        continue;
      }
    }
    if (key === 'condition' || key === 'speed') {
      const set = findBlockChain(parsed.blocks, statement.line).find(
        (block) => block.keyword.toLowerCase() === 'locomotorset',
      );

      if (set) {
        const read = locomotorSets.get(set) ?? {};

        read[key] = values[0];
        locomotorSets.set(set, read);
        continue;
      }
    }
    if (key.startsWith('shadow')) {
      if (draw) {
        const shadow =
          owner && state && MODEL_STATE.test(state.keyword)
            ? readShadowField(owner.shadow, key, values[0])
            : undefined;

        if (shadow && owner) {
          owner.shadow = shadow;
          continue;
        }
      } else if (findBlockChain(parsed.blocks, statement.line).length < 2) {
        const shadow = readShadowField(scene.shadow, key, values[0]);

        if (shadow) {
          scene.shadow = shadow;
          continue;
        }
      }
    }
    if (key === 'bannercarriersallowed') {
      scene.bannerLevel ??= 1;
      continue;
    }
    if (key === 'bannercarrierminlevel') {
      const level = Number(values[0]);

      if (Number.isInteger(level) && level >= 0) {
        scene.bannerLevel = level;
      }
      continue;
    }

    const damageField = DAMAGE_FIELD.exec(key);

    if (damageField) {
      scene.damageSubObjects[damageField[1] as BodyDamageState].push(
        ...values.map((pattern) => ({
          pattern,
          hide: damageField[2] === 'hide',
          source: statement.keyword.text,
        })),
      );
      continue;
    }

    const chain = findBlockChain(parsed.blocks, statement.line);
    const grantModule = chain.find((block) => GRANT_AT_CREATION.test(block.moduleType ?? ''));

    if (grantModule) {
      const grant = grants.get(grantModule) ?? { name: '', isOnCompletion: false };

      if (key === 'upgradetogrant') {
        grant.name = values[0];
      } else if (key === 'giveonbuildcomplete') {
        grant.isOnCompletion ||= /^yes$/i.test(values[0]);
      } else if (key === 'exemptstatus') {
        grant.isOnCompletion ||= values.some((each) => /^under_construction$/i.test(each));
      }
      grants.set(grantModule, grant);
      continue;
    }

    const listUpdate = chain.find((block) => CREATION_LIST_UPDATE.test(block.moduleType ?? ''));

    if (listUpdate && key === 'ocl') {
      (scene.updateCreationLists ??= []).push({
        name: values[0],
        ...(listUpdate.moduleTag ? { moduleTag: listUpdate.moduleTag } : {}),
      });
      continue;
    }

    if (key === 'spawnpointbonename' && chain.some((block) => SPAWN_POINT_EXIT.test(block.moduleType ?? ''))) {
      scene.spawnPointBone = values[0];
      continue;
    }

    const spawner = chain.find((block) => SPAWN_BEHAVIOR.test(block.moduleType ?? ''));

    if (spawner && (key === 'spawntemplatename' || key === 'spawnnumber')) {
      const upgrade = upgradeOf(spawner);
      const population = (upgrade.population ??= {
        ...(spawner.moduleTag ? { moduleTag: spawner.moduleTag } : {}),
        names: [],
        count: 0,
      });

      if (key === 'spawntemplatename') {
        population.names.push(...values);
        upgrade.spawns ??= values[0];
      } else {
        population.count = Math.max(0, Number.parseInt(values[0], 10) || 0);
      }
      continue;
    }

    const upgradeModule = chain.find(
      (block) =>
        LOOK_UPGRADE.test(block.moduleType ?? '') ||
        animatingUpgrades.has(block) ||
        SPAWN_BEHAVIOR.test(block.moduleType ?? ''),
    );

    if (upgradeModule && key === 'customanimandduration') {
      const raised = readRaisedAnimation(values);

      if (raised) {
        const upgrade = upgradeOf(upgradeModule);

        if (raised.isHeld) {
          (upgrade.addsConditions ??= []).push(raised.condition);
        } else {
          (upgrade.raisesTemporarily ??= []).push(raised.condition);
        }
      }
      continue;
    }

    if (upgradeModule && key === 'upgradetexture') {
      if (values.length === 3) {
        (upgradeOf(upgradeModule).textures ??= []).push({ from: values[0], to: values[2] });
      }
      continue;
    }
    if (upgradeModule && key === 'excludesubobjects') {
      (upgradeOf(upgradeModule).excludes ??= []).push(...values);
      continue;
    }
    if (upgradeModule && key === 'conflictswith') {
      (upgradeOf(upgradeModule).conflicts ??= []).push(...values);
      continue;
    }
    if (upgradeModule && key === 'requiresalltriggers') {
      upgradeOf(upgradeModule).requiresAllTriggers = /^yes$/i.test(values[0]);
      continue;
    }
    if (upgradeModule && key === 'addconditionflags') {
      (upgradeOf(upgradeModule).addsConditions ??= []).push(...values);
      continue;
    }
    if (upgradeModule && key === 'removeconditionflags') {
      (upgradeOf(upgradeModule).removesConditions ??= []).push(...values);
      continue;
    }
    if (upgradeModule && key === 'addtempconditionflag') {
      const flag = stripKey(values[values.length - 1]).toUpperCase();

      if (flag) {
        (upgradeOf(upgradeModule).raisesTemporarily ??= []).push(flag);
      }
      continue;
    }
    if (
      upgradeModule &&
      (key === 'grantupgrade' ||
        (key === 'upgrade' && (upgradeModule.moduleType ?? '').toLowerCase() === 'castleupgrade'))
    ) {
      (upgradeOf(upgradeModule).grants ??= []).push(...values);
      continue;
    }
    if (upgradeModule && key === 'thingtospawn') {
      upgradeOf(upgradeModule).spawns = values[0];
      continue;
    }
    if (
      upgradeModule &&
      key === 'offset' &&
      (upgradeModule.moduleType ?? '').toLowerCase() === 'objectcreationupgrade'
    ) {
      upgradeOf(upgradeModule).offset = readOffset(values);
      continue;
    }
    if (upgradeModule && key === 'weaponcondition') {
      upgradeOf(upgradeModule).weaponSetFlag = values[0];
      continue;
    }

    if (upgradeModule && key === 'showsubobjects') {
      upgradeOf(upgradeModule).shows.push(...values);
      continue;
    }
    if (upgradeModule && key === 'hidesubobjects') {
      upgradeOf(upgradeModule).hides.push(...values);
      continue;
    }
    if (upgradeModule && key === 'triggeredby') {
      upgradeOf(upgradeModule).triggers.push(...values);
      continue;
    }
    if (upgradeModule && key === 'waitbeforefadeinseconds') {
      upgradeOf(upgradeModule).waitsBeforeShowing = Number(values[0]) > 0;
      continue;
    }
    if (upgradeModule && key === 'startsactive') {
      upgradeOf(upgradeModule).startsActive = /^yes$/i.test(values[0]);
      continue;
    }

    if (getAudioReferenceKind(statement.context, statement.keyword.text)) {
      const names = values.length > 1 && PHASE.test(values[0]) ? values.slice(1) : values;
      const module = object.children.find(
        (block) => block.startLine <= statement.line && statement.line <= block.endLine,
      )?.moduleType;

      for (const name of names.filter((value) => !/^none$/i.test(value))) {
        if (
          !scene.voices.some(
            (voice) =>
              voice.name === name && voice.field === statement.keyword.text,
          )
        ) {
          scene.voices.push({ field: statement.keyword.text, name, ...(module ? { module } : {}) });
        }
      }
      continue;
    }

    if (owner && key === 'texture') {
      if (values.length > 1) {
        (owner.textures ??= []).push({ from: values[0], to: values[1] });
      }
      continue;
    }
    if (draw && !state && key === 'staticmodellodmode') {
      if (/^yes$/i.test(values[0])) {
        (scene.detailDraws ??= []).push(getDrawTag(draw));
      }
      continue;
    }
    if (draw && !state && key === 'randomtexture') {
      if (values.length > 2) {
        (scene.randomTextures ??= []).push({
          draw: getDrawTag(draw),
          index: values[1],
          from: values[2],
          to: values[0],
        });
      }
      continue;
    }
    if (
      draw &&
      !state &&
      FLOOR_DRAW.test(draw.moduleType ?? '') &&
      (key === 'modelname' || key === 'weathertexture')
    ) {
      let floor = floors.get(draw);

      if (!floor) {
        floor = {};
        floors.set(draw, floor);
        (scene.floors ??= []).push(floor);
      }
      if (key === 'modelname') {
        floor.model = values[0];
      } else if (values[0].toLowerCase() === 'snowy' && values[1]) {
        floor.snowTexture = values[1];
      }
      continue;
    }

    if (owner && MODEL_FIELDS.has(key)) {
      owner.model = values[0];
    } else if (owner && key === 'statename') {
      owner.name = values[0];
    } else if (owner && key === 'retainsubobjects') {
      owner.retainsSubObjects = /^yes$/i.test(values[0]);
    } else if (owner && key === 'flags' && values.some((each) => /^start_frame_last$/i.test(each))) {
      owner.startsAtLastFrame = true;
    } else if (owner && key === 'animationmode') {
      owner.playsOnce ??= /^once$/i.test(values[0]);
    } else if (owner && ANIMATION_FIELDS.has(key) && !/^none$/i.test(values[0])) {
      owner.animations.push(values[0]);
    } else if (owner && key === 'particlesysbone' && values.length > 1) {
      if (isSystem(values[1])) {
        owner.particles.push({ bone: values[0], system: values[1] });
      }
    } else if (owner) {
      if (namesFx(schema, statement)) {
        const frame = key === 'fxevent' ? readFrame(values) : undefined;

        for (const name of values.map(stripKey).filter(isFx)) {
          if (frame === undefined) {
            owner.fx.push(name);
          } else {
            (owner.fxEvents ??= []).push({ name, frame });
          }
        }
      }
    } else {
      const namesList = namesFx(schema, statement) || FX_FIELD.test(key);
      const namesSystem = SYSTEM_FIELD.test(key);

      if (!namesList && !namesSystem) {
        continue;
      }

      const module = object.children.find(
        (block) => block.startLine <= statement.line && statement.line <= block.endLine,
      )?.moduleType;
      const bone = values.find((value) => /^bone:(?!none$)./i.test(value));

      for (const name of values.map(stripKey)) {
        const isList = namesList && isFx(name);

        if (!isList && !(namesSystem && isSystem(name))) {
          continue;
        }

        const when = getEffectConditions(module, key);

        scene.fx.push({
          field: statement.keyword.text,
          name,
          ...(module ? { module } : {}),
          ...(isList ? {} : { isSystem: true }),
          ...(bone ? { bone: stripKey(bone) } : {}),
          ...(PHASE.test(values[0]) ? { phase: values[0] } : {}),
          ...(when ? { when } : {}),
        });
      }
    }
  }

  for (const { startLine, endLine } of lines.length ? parsed.scripts : []) {
    const { draw, state } = findDrawPlace(parsed.blocks, startLine);

    if (draw && state && startLine > object.startLine && endLine < object.endLine) {
      const owner = stateOf(draw, state);
      const idle = findIdleState(scene, owner.draw);
      const { rules, conditional } = readStateScript(
        lines.slice(startLine + 1, endLine).join('\n'),
        `${owner.label} script`,
        idle ? (owner === idle ? null : (idle.name ?? null)) : undefined,
      );

      owner.subObjects.rules.push(...rules);
      owner.subObjects.conditional.push(...conditional);
    }
  }

  const defaults = new Map<string, string>();

  for (const state of scene.states) {
    if (state.model && DEFAULT_STATE.test(state.label)) {
      defaults.set(state.draw, state.model);
    }
  }
  for (const state of scene.states) {
    state.model ??=
      defaults.get(state.draw) ??
      scene.states.find((other) => other.draw === state.draw && other.model)
        ?.model;
  }

  inheritTextures(scene.states);

  scene.states = scene.states.filter(
    (state) =>
      state.model ||
      state.animations.length ||
      state.fx.length ||
      state.fxEvents?.length ||
      state.particles.length,
  );

  for (const draw of object.children.filter((block) => block.keyword.toLowerCase() === 'draw')) {
    for (const block of draw.children) {
      const read = states.get(block);

      if (ANIMATION_STATE.test(block.keyword) && (!read || !scene.states.includes(read))) {
        (scene.cliplessStates ??= []).push({
          draw: getDrawTag(draw),
          kind: 'animation',
          label: formatBlockHeader(block),
          line: block.startLine,
          animations: [],
          fx: [],
          particles: [],
          subObjects: read?.subObjects ?? { rules: [], conditional: [] },
        });
      }
    }
  }

  for (const upgrade of scene.upgrades) {
    if (upgrade.population && !upgrade.triggers.length) {
      upgrade.startsActive = true;
    }
  }

  const granted = [...grants.values()].filter((grant) => grant.name);

  if (granted.length) {
    scene.creationGrants = granted;
  }
  scene.speed = [...locomotorSets.values()]
    .filter((set) => !set.condition || /^set_normal$/i.test(set.condition))
    .at(-1)?.speed;
  scene.states.push(...listMovingStates(scene));
  return scene;
};

export const findSceneFocus = (
  parsed: SageDocument,
  line: number,
  scene: ObjectScene,
): SceneFocus => {
  const { draw, state } = findDrawPlace(parsed.blocks, line);
  const focus: SceneFocus = {};

  if (draw && state) {
    const tag = getDrawTag(draw);
    const at = scene.states.findIndex(
      (each) =>
        each.draw.toLowerCase() === tag.toLowerCase() &&
        each.label.toLowerCase() === formatBlockHeader(state).toLowerCase(),
    );

    focus.state = at < 0 ? undefined : at;
  }

  const statement = parsed.statements.find((each) => each.line === line);
  const key = (statement?.keyword.text ?? '').toLowerCase();
  const values = statement?.values.map((value) => stripKey(value.text)) ?? [];
  const named = (list: readonly string[]) =>
    values.find((value) => list.some((each) => each.toLowerCase() === value.toLowerCase()));
  const states =
    focus.state === undefined ? scene.states : [scene.states[focus.state]];

  if (ANIMATION_FIELDS.has(key)) {
    focus.animation = named(states.flatMap((each) => each.animations));
  } else if (key === 'particlesysbone') {
    focus.system = named(
      states.flatMap((each) => each.particles.map((p) => p.system)),
    );
  } else {
    focus.fx = named([
      ...states.flatMap((each) => [
        ...each.fx,
        ...(each.fxEvents ?? []).map((event) => event.name),
      ]),
      ...scene.fx.map((each) => each.name),
    ]);
  }
  return focus;
};
