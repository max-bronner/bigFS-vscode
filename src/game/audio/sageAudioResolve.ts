import type { SageBlock, SageDocument } from '../../formats/ini/sageIniParser';

export const MAX_AUDIO_DEPTH = 4;

export interface AudioDefinition {
  keyword: string;
  fields: { key: string; values: string[] }[];
  sideSounds: { side: string; sound: string }[];
}

export type AudioLookup = (
  name: string,
) => AudioDefinition | undefined | Promise<AudioDefinition | undefined>;

export interface AudioVariant {
  label: string;
  file: string;
  weight?: number;
}

const NAME_PREFIX = /^\s*(?:eva:|\+sound:)/i;
const SOUND_ROLES = /^(sounds\w*|attack|decay)$/i;
const STREAMED = /^(dialogevent|musictrack|ambientstream|streamedsound)$/i;
const MULTISOUND = /^multisound$/i;
const EVA = /^(newevaevent|predefinedevaevent)$/i;

export const stripAudioPrefix = (name: string): string => {
  let result = name;

  for (let again = true; again; ) {
    const next = result.replace(NAME_PREFIX, '');

    again = next !== result;
    result = next;
  }
  return result.trim();
};

const unquote = (text: string) => text.replace(/^"|"$/g, '');

const splitWeight = (token: string): { name: string; weight?: number } => {
  const match = /^(.*):(\d+)$/.exec(unquote(token));

  return match
    ? { name: match[1], weight: Number(match[2]) }
    : { name: unquote(token) };
};

const fieldsNamed = (definition: AudioDefinition, pattern: RegExp) =>
  definition.fields.filter((field) => pattern.test(field.key));

const stemOf = (name: string) =>
  name.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');

export const resolveAudio = async (
  name: string,
  lookup: AudioLookup,
): Promise<AudioVariant[]> => walk(stripAudioPrefix(name), lookup, [], 0);

const prefixed = (prefix: string, variants: AudioVariant[]): AudioVariant[] =>
  variants.map((variant) => ({
    ...variant,
    label: `${prefix} › ${variant.label}`,
  }));

const walk = async (
  name: string,
  lookup: AudioLookup,
  path: string[],
  depth: number,
): Promise<AudioVariant[]> => {
  const key = name.toLowerCase();

  if (!name || path.includes(key)) {
    return [];
  }

  const definition = await lookup(name);

  if (!definition) {
    return [];
  }

  const here = [...path, key];
  const follow = async (next: string): Promise<AudioVariant[]> =>
    depth < MAX_AUDIO_DEPTH
      ? walk(stripAudioPrefix(next), lookup, here, depth + 1)
      : [];

  if (/^audioevent$/i.test(definition.keyword)) {
    const variants: AudioVariant[] = [];

    for (const field of definition.fields) {
      if (!SOUND_ROLES.test(field.key)) {
        continue;
      }
      for (const token of field.values) {
        const { name: file, weight } = splitWeight(token);

        if (file && !/^none$/i.test(file)) {
          variants.push({
            label: field.key,
            file,
            ...(weight === undefined ? {} : { weight }),
          });
        }
      }
    }
    return variants;
  }

  if (STREAMED.test(definition.keyword)) {
    return fieldsNamed(definition, /^filename$/i).flatMap((field) =>
      field.values
        .map(unquote)
        .filter(Boolean)
        .map((file) => ({ label: 'Filename', file })),
    );
  }

  if (MULTISOUND.test(definition.keyword)) {
    const variants: AudioVariant[] = [];

    for (const field of fieldsNamed(definition, /^subsounds?$/i)) {
      for (const token of field.values) {
        const subsound = splitWeight(token).name;

        variants.push(...prefixed(subsound, await follow(subsound)));
      }
    }
    return variants;
  }

  if (EVA.test(definition.keyword)) {
    const variants: AudioVariant[] = [];

    for (const { side, sound } of definition.sideSounds) {
      if (sound) {
        variants.push(...prefixed(side || '?', await follow(sound)));
      }
    }
    return variants;
  }

  if (/^video$/i.test(definition.keyword)) {
    const stem = stemOf(
      fieldsNamed(definition, /^filename$/i)[0]?.values[0] ?? name,
    );
    const variants: AudioVariant[] = [];

    for (const event of [`${stem}_Music`, stem]) {
      variants.push(...prefixed(event, await follow(event)));
    }
    return variants;
  }
  return [];
};

export const audioDefinitionOf = (
  parsed: SageDocument,
  block: SageBlock,
): AudioDefinition => {
  const inside = (line: number, of: SageBlock) =>
    of.startLine < line && line <= of.endLine;
  const fieldsOf = (of: SageBlock) =>
    parsed.statements.filter(
      (statement) =>
        statement.kind === 'field' &&
        inside(statement.line, of) &&
        !of.children.some((child) => inside(statement.line, child)),
    );

  return {
    keyword: block.keyword,
    fields: fieldsOf(block).map((statement) => ({
      key: statement.keyword.text,
      values: statement.values.map((value) => value.text),
    })),
    sideSounds: block.children
      .filter((child) => /^sidesound$/i.test(child.keyword))
      .map((child) => {
        const own = fieldsOf(child);
        const read = (key: string) =>
          own
            .find((statement) => statement.keyword.text.toLowerCase() === key)
            ?.values[0]?.text.replace(/^"|"$/g, '') ?? '';

        return { side: read('side'), sound: read('sound') };
      }),
  };
};
