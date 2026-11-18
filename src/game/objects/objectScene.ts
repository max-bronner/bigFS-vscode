import type { SageBlock, SageDocument, SageStatement } from '../../formats/ini/sageIniParser';
import { audioReferenceKind } from '../audio/sageAudioFields';
import type { SageIniSchema } from '../../formats/ini/sageIniSchema';

export type StateKind = 'model' | 'animation';

export interface SceneState {
  draw: string;
  kind: StateKind;
  label: string;
  model?: string;
  animations: string[];
  fx: string[];
  particles: { bone: string; system: string }[];
}

export interface ObjectScene {
  name: string;
  states: SceneState[];
  fx: { field: string; name: string }[];
  voices: { field: string; name: string }[];
}

export interface SceneFocus {
  state?: number;
  animation?: string;
  fx?: string;
  system?: string;
}

const lower = (text: string) => text.toLowerCase();

const MODEL_FIELDS = new Set(['model']);
const ANIMATION_FIELDS = new Set(['animation', 'animationname']);
const DEFAULT_STATE = /^default/i;

const chainAt = (blocks: readonly SageBlock[], line: number): SageBlock[] => {
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

const headerOf = (block: SageBlock) =>
  [block.keyword, block.name].filter(Boolean).join(' = ');

const placeOf = (blocks: readonly SageBlock[], line: number) => {
  const chain = chainAt(blocks, line);
  const at = chain.findIndex((block) => lower(block.keyword) === 'draw');

  return at < 0
    ? { draw: undefined, state: undefined }
    : { draw: chain[at], state: chain[at + 1] };
};

export const readObjectScene = (
  parsed: SageDocument,
  schema: SageIniSchema,
  isFx: (name: string) => boolean,
  isSystem: (name: string) => boolean,
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
  };
  const stateOf = (draw: SageBlock, block: SageBlock) => {
    let state = states.get(block);

    if (!state) {
      state = {
        draw: draw.moduleTag ?? draw.moduleType ?? 'Draw',
        kind: /animation/i.test(block.keyword) ? 'animation' : 'model',
        label: headerOf(block),
        animations: [],
        fx: [],
        particles: [],
      };
      states.set(block, state);
      scene.states.push(state);
    }
    return state;
  };

  for (const statement of parsed.statements) {
    if (
      statement.kind !== 'field' ||
      statement.line <= object.startLine ||
      statement.line >= object.endLine ||
      !statement.values.length
    ) {
      continue;
    }

    const key = lower(statement.keyword.text);
    const values = statement.values.map((value) => value.text);
    const { draw, state } = placeOf(parsed.blocks, statement.line);
    const owner = draw && state ? stateOf(draw, state) : undefined;

    if (audioReferenceKind(statement.context, statement.keyword.text)) {
      for (const name of values.filter((value) => !/^none$/i.test(value))) {
        if (
          !scene.voices.some(
            (voice) =>
              voice.name === name && voice.field === statement.keyword.text,
          )
        ) {
          scene.voices.push({ field: statement.keyword.text, name });
        }
      }
      continue;
    }

    if (owner && MODEL_FIELDS.has(key)) {
      owner.model = values[0];
    } else if (owner && ANIMATION_FIELDS.has(key) && values[0] !== 'NONE') {
      owner.animations.push(values[0]);
    } else if (owner && key === 'particlesysbone' && values.length > 1) {
      if (isSystem(values[1])) {
        owner.particles.push({ bone: values[0], system: values[1] });
      }
    } else if (namesFx(schema, statement)) {
      for (const name of values.filter(isFx)) {
        if (owner) {
          owner.fx.push(name);
        } else {
          scene.fx.push({ field: statement.keyword.text, name });
        }
      }
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

  scene.states = scene.states.filter(
    (state) =>
      state.model ||
      state.animations.length ||
      state.fx.length ||
      state.particles.length,
  );
  return scene;
};

export const focusAt = (
  parsed: SageDocument,
  line: number,
  scene: ObjectScene,
): SceneFocus => {
  const { draw, state } = placeOf(parsed.blocks, line);
  const focus: SceneFocus = {};

  if (draw && state) {
    const tag = draw.moduleTag ?? draw.moduleType ?? 'Draw';
    const at = scene.states.findIndex(
      (each) =>
        lower(each.draw) === lower(tag) &&
        lower(each.label) === lower(headerOf(state)),
    );

    focus.state = at < 0 ? undefined : at;
  }

  const statement = parsed.statements.find((each) => each.line === line);
  const key = lower(statement?.keyword.text ?? '');
  const values = statement?.values.map((value) => value.text) ?? [];
  const named = (list: readonly string[]) =>
    values.find((value) => list.some((each) => lower(each) === lower(value)));
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
      ...states.flatMap((each) => each.fx),
      ...scene.fx.map((each) => each.name),
    ]);
  }
  return focus;
};
