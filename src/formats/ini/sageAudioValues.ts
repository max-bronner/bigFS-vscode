import {
  AUDIO_NAMESPACES,
  EVA_NAMESPACES,
  getAudioReferenceKind,
  getLastContextSegment,
  getKindNamespaces,
} from './sageAudioFields';
import type { AudioReferenceKind } from './sageAudioFields';
import type { SageStatement, SageToken } from './sageIniParser';
import type { SageIniSchema } from './sageIniSchema';
import { getParent } from './sageIniNames';
import { findNameOffset } from './sageReferenceFields';

export interface AudioName {
  name: string;
  start: number;
  end: number;
  namespaces: readonly string[];
}

const NO_SOUND = /^(?:none|nosound)$/i;

const EVA_PREFIX = /^eva:/i;

const SOUND_PREFIX = /^[+-]?sound:/i;

const SOUND_KEY = /^sound:/i;

const KEYED_FIELDS: ReadonlySet<string> = new Set([
  'animationsound',
  'modelcondition',
  'duck',
]);

const AUDIO_SENTINEL =
  /^(?:[+-]?[\d.]+%?|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*|None|NONE|NoSound)$/;

export const isAudioSentinel = (text: string): boolean =>
  AUDIO_SENTINEL.test(text);

const named = (
  token: SageToken,
  from: number,
  to: number,
  namespaces: readonly string[],
): AudioName[] =>
  to > from
    ? [
        {
          name: token.text.slice(from, to),
          start: token.start + from,
          end: token.start + to,
          namespaces,
        },
      ]
    : [];

const nameIn = (
  token: SageToken,
  namespaces: readonly string[],
): AudioName[] => {
  if (NO_SOUND.test(token.text)) {
    return [];
  }

  const eva = EVA_PREFIX.exec(token.text);

  if (eva) {
    return named(token, eva[0].length, token.text.length, EVA_NAMESPACES);
  }

  const sound = SOUND_PREFIX.exec(token.text);

  if (sound) {
    return named(token, sound[0].length, token.text.length, AUDIO_NAMESPACES);
  }

  return named(token, 0, token.text.length, namespaces);
};

const weightedNameIn = (token: SageToken): AudioName[] => {
  const colon = token.text.lastIndexOf(':');

  return colon > 0 && /^\d+$/.test(token.text.slice(colon + 1))
    ? nameIn({ ...token, text: token.text.slice(0, colon) }, AUDIO_NAMESPACES)
    : nameIn(token, AUDIO_NAMESPACES);
};

const keyedSoundsIn = (values: readonly SageToken[]): AudioName[] =>
  values.flatMap((token, index) => {
    if (!SOUND_KEY.test(token.text)) {
      return [];
    }

    const length = 'Sound:'.length;

    return token.text.length > length
      ? nameIn(
          {
            text: token.text.slice(length),
            start: token.start + length,
            end: token.end,
          },
          AUDIO_NAMESPACES,
        )
      : values[index + 1]
        ? nameIn(values[index + 1], AUDIO_NAMESPACES)
        : [];
  });

export const findAudioNames = (
  statement: Pick<SageStatement, 'keyword' | 'values'>,
  kind: AudioReferenceKind,
  contextName = '',
): AudioName[] => {
  const field = statement.keyword.text.toLowerCase();
  const { values } = statement;

  if (KEYED_FIELDS.has(field)) {
    return keyedSoundsIn(values);
  }

  if (field === 'subsounds') {
    return values.flatMap(weightedNameIn);
  }

  if (
    field === 'sound' &&
    getLastContextSegment(contextName) === 'shipslowdeathbehavior'
  ) {
    return values
      .slice(1, 2)
      .flatMap((token) => nameIn(token, AUDIO_NAMESPACES));
  }

  return values.flatMap((token) => nameIn(token, getKindNamespaces(kind)));
};

export interface ReferencedName extends AudioName {
  isAudio: boolean;
}

export const findReferencedNames = (
  statement: SageStatement,
  schema: SageIniSchema,
): ReferencedName[] => {
  const { keyword, context, values } = statement;
  const parent = getParent(statement);

  if (statement.block) {
    return parent
      ? [
          {
            name: parent.token.text,
            start: parent.token.start,
            end: parent.token.end,
            namespaces: [parent.namespace],
            isAudio: false,
          },
        ]
      : [];
  }

  const contextName = schema.describeContext(context);
  const kind = getAudioReferenceKind(contextName, keyword.text);

  if (kind) {
    return findAudioNames(statement, kind, contextName).map((name) => ({
      ...name,
      isAudio: true,
    }));
  }

  return values.flatMap(({ text, start, end }, index) => {
    const namespaces = schema.getReferenceNamespaces(
      keyword.text,
      context,
      index,
    );

    const offset = findNameOffset(keyword.text, values, index);

    return namespaces.length && offset !== undefined
      ? [
          {
            name: text.slice(offset),
            start: start + offset,
            end,
            namespaces,
            isAudio: false,
          },
        ]
      : [];
  });
};
