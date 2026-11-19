import { isAudioSentinel, findReferencedNames } from './sageAudioValues';
import { CONSTANT_NAME } from './sageReferenceFields';
import type { SageDocument } from './sageIniParser';
import type { SageIniSchema } from './sageIniSchema';

export interface ReferenceLookup {
  findMacro(name: string): unknown;
  findDefinitions(namespace: string, name: string): readonly unknown[];
  countDefinitions(namespace: string): number;
}

export interface UnresolvedReference {
  name: string;
  line: number;
  start: number;
  end: number;
  namespaces: readonly string[];
}

export const AUTO_CHECK_MINIMUM = 50;

const NOT_A_NAME = new RegExp(
  `^(?:[+-]?[\\d.]+%?|${CONSTANT_NAME.source.slice(1, -1)}|[^:]+:.*|[Nn][Oo][Nn][Ee])$`,
);

export const isNotAName = (value: string): boolean => NOT_A_NAME.test(value);

export const findUnresolvedReferences = (
  parsed: SageDocument,
  schema: SageIniSchema,
  lookup: ReferenceLookup,
  isOn: boolean,
): UnresolvedReference[] => {
  const unresolved: UnresolvedReference[] = [];

  for (const statement of parsed.statements) {
    for (const reference of findReferencedNames(statement, schema)) {
      const namespaces = reference.isAudio
        ? reference.namespaces
        : reference.namespaces.filter(
            (namespace) =>
              isOn || lookup.countDefinitions(namespace) >= AUTO_CHECK_MINIMUM,
          );
      const isTrusted =
        isOn ||
        !reference.isAudio ||
        namespaces.reduce(
          (sum, namespace) => sum + lookup.countDefinitions(namespace),
          0,
        ) >= AUTO_CHECK_MINIMUM;

      if (
        !namespaces.length ||
        !isTrusted ||
        (reference.isAudio
          ? isAudioSentinel(reference.name)
          : isNotAName(reference.name)) ||
        lookup.findMacro(reference.name) ||
        namespaces.some(
          (namespace) => lookup.findDefinitions(namespace, reference.name).length,
        )
      ) {
        continue;
      }

      unresolved.push({
        name: reference.name,
        line: statement.line,
        start: reference.start,
        end: reference.end,
        namespaces,
      });
    }
  }

  return unresolved;
};
