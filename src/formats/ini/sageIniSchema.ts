import { createReferenceNamespaceCache } from './createReferenceNamespaceCache';
import {
  getAudioReferenceKind,
  isAudioNamespace,
  getKindNamespaces,
} from './sageAudioFields';
import {
  NOT_REFERENCE_FIELDS,
  NOT_REFERENCE_NAMESPACES,
  toCanonicalNamespace,
  toCanonicalNamespaces,
  widenParticleNamespaces,
  isNameTokenAt,
  getScopedNamespaces,
} from './sageReferenceFields';

export type KeywordKind = 'block' | 'field';

export const ROOT_CONTEXT = '<root>';

export const FRAGMENT_CONTEXT = '<fragment>';

export const UNCHECKED_CONTEXT = '<unchecked>';

export type SageGame = 'bfme1' | 'bfme2' | 'rotwk';

const GAME_MASKS: Record<SageGame, number> = { bfme1: 3, bfme2: 1, rotwk: 2 };

export interface EngineField {
  type: string;
  used: boolean;
}

export interface KeywordResolution {
  kind: KeywordKind;
  childContext?: string;
  moduleType?: string;
  isLegacy?: boolean;
}

type ChildTarget = number | Record<string, number> | 'module';

interface ContextData {
  n: string;
  f: [string, number][];
  w: number;
  c: ChildData[];
}

interface ChildData {
  k: string;
  m: number;
  t: ChildTarget;
  a?: string;
}

interface SchemaFile {
  version: number;
  contexts: ContextData[];
  fileScope: Record<string, number>;
  fileLeaves?: Record<string, number>;
  fileLegacy?: string[];
  modules: Record<string, number>;
  fields: Record<string, { t: string; u: 0 | 1 }>;
  references: Record<string, string[]>;
  slotTypes: Record<string, string[]>;
  enumValues: Record<string, string[]>;
}

export interface SageIniSchema {
  readonly game: SageGame;

  readonly isStrict: boolean;

  resolve(
    context: string,
    keyword: string,
    values: readonly string[],
  ): KeywordResolution | undefined;

  isChecked(context: string): boolean;

  describeContext(context: string): string;

  isModuleSlot(keyword: string): boolean;

  isEngineBlock(name: string): boolean;

  getEngineField(name: string): EngineField | undefined;

  getReferenceNamespaces(
    field: string,
    context?: string,
    tokenIndex?: number,
  ): readonly string[];

  isReferenceNamespace(namespace: string): boolean;

  getContextKeywords(
    context: string,
  ): readonly { name: string; kind: KeywordKind }[];

  getSlotTypes(slot: string): readonly string[];

  getEnumValues(field: string): readonly string[];
}

const foldKeys = <T>(record: Record<string, T>): Map<string, T> =>
  new Map(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
  );

export const createSageIniSchema = (
  parsed: unknown,
  game: SageGame = 'rotwk',
): SageIniSchema => {
  const file = parsed as SchemaFile;

  if (file?.version !== 4) {
    throw new Error(
      `Unsupported SAGE INI schema version: ${String(file?.version)}`,
    );
  }

  const mask = GAME_MASKS[game];
  const fileScope = foldKeys(file.fileScope);
  const modules = foldKeys(file.modules);
  const fields = foldKeys(file.fields);
  const references = new Map<string, readonly string[]>(
    [...foldKeys(file.references)].flatMap(([field, namespaces]) => {
      const kept = widenParticleNamespaces(
        toCanonicalNamespaces(
          namespaces.filter(
            (namespace) =>
              !NOT_REFERENCE_NAMESPACES.has(namespace.toLowerCase()),
          ),
        ),
      );

      return NOT_REFERENCE_FIELDS.has(field) || !kept.length
        ? []
        : [[field, kept] as const];
    }),
  );
  const referenceNamespaces = new Set(
    [...references.values()]
      .flat()
      .filter((namespace) => !isAudioNamespace(namespace))
      .map((namespace) => namespace.toLowerCase()),
  );
  const slotTypes = foldKeys(file.slotTypes);
  const enumValues = foldKeys(file.enumValues);

  const contexts = file.contexts.map((context) => ({
    name: context.n,
    accepts: context.w & mask,
    fields: new Map(
      context.f
        .filter(([, fieldMask]) => fieldMask & mask)
        .map(([name]) => [name.toLowerCase(), name]),
    ),
    children: new Map(
      context.c
        .filter((child) => child.m & mask)
        .map((child) => [child.k.toLowerCase(), child]),
    ),
  }));

  type Context = (typeof contexts)[number];

  const mergedIds = new Map<string, number>();

  const mergeContexts = (ids: readonly number[]): number => {
    const unique = Array.from(new Set(ids)).sort((a, b) => a - b);

    if (unique.length === 1) {
      return unique[0];
    }

    const key = unique.join(',');
    const known = mergedIds.get(key);

    if (known !== undefined) {
      return known;
    }

    const members = unique.map((id) => contexts[id]);
    const merged: Context = {
      name: members[0].name,
      accepts: members.reduce((all, member) => all | member.accepts, 0),
      fields: new Map(members.flatMap((member) => Array.from(member.fields))),
      children: new Map(),
    };
    const id = contexts.push(merged) - 1;

    mergedIds.set(key, id);

    const byKeyword = new Map<string, ChildData[]>();

    members
      .flatMap((member) => Array.from(member.children))
      .forEach(([name, child]) => {
        byKeyword.set(name, [...(byKeyword.get(name) ?? []), child]);
      });

    byKeyword.forEach((children, name) => {
      const [first] = children;
      const numeric = children.every((child) => typeof child.t === 'number');

      merged.children.set(
        name,
        numeric && children.length > 1
          ? {
              ...first,
              t: mergeContexts(children.map((child) => child.t as number)),
            }
          : first,
      );
    });

    return id;
  };

  const fragmentCandidates = new Map<string, ChildData[]>();

  contexts.forEach((context) =>
    context.children.forEach((child, name) =>
      fragmentCandidates.set(name, [
        ...(fragmentCandidates.get(name) ?? []),
        child,
      ]),
    ),
  );

  const fragmentFields = new Set(
    contexts.flatMap((context) => Array.from(context.fields.keys())),
  );
  const fileLeaves = foldKeys(file.fileLeaves ?? {});
  const fileLegacy = new Set(
    (file.fileLegacy ?? []).map((name) => name.toLowerCase()),
  );

  fileLeaves.forEach((_, name) => fragmentFields.add(name));

  const moduleSlots = new Set(
    Array.from(fragmentCandidates.values())
      .flat()
      .filter((child) => child.t === 'module')
      .map((child) => child.k.toLowerCase()),
  );

  const contextOf = (context: string) =>
    /^\d+$/.test(context) ? contexts[Number(context)] : undefined;

  const opensBlock = (child: ChildData, values: readonly string[]): boolean =>
    child.a === undefined || values[0]?.toUpperCase() === child.a;

  const resolveChild = (
    child: ChildData,
    values: readonly string[],
  ): KeywordResolution => {
    const [first] = values;

    if (child.t === 'module') {
      const id =
        first === undefined ? undefined : modules.get(first.toLowerCase());

      return {
        kind: 'block',
        moduleType: first,
        childContext: id === undefined ? UNCHECKED_CONTEXT : String(id),
      };
    }

    if (typeof child.t === 'number') {
      return { kind: 'block', childContext: String(child.t) };
    }

    const id = first === undefined ? undefined : child.t[first];

    return {
      kind: 'block',
      childContext: id === undefined ? UNCHECKED_CONTEXT : String(id),
    };
  };

  const resolve = (
    context: string,
    keyword: string,
    values: readonly string[],
  ): KeywordResolution | undefined => {
    const key = keyword.toLowerCase();
    const rootBlock = fileScope.get(key);

    if (context === ROOT_CONTEXT) {
      if (rootBlock !== undefined) {
        return { kind: 'block', childContext: String(rootBlock) };
      }

      if (fileLegacy.has(key)) {
        return {
          kind: 'block',
          childContext: UNCHECKED_CONTEXT,
          isLegacy: true,
        };
      }

      return fileLeaves.has(key) ? { kind: 'field' } : undefined;
    }

    if (context === FRAGMENT_CONTEXT) {
      if (rootBlock !== undefined) {
        return { kind: 'block', childContext: String(rootBlock) };
      }

      const opening = (fragmentCandidates.get(key) ?? []).filter((candidate) =>
        opensBlock(candidate, values),
      );

      if (opening.length) {
        const resolved = opening.map((candidate) =>
          resolveChild(candidate, values),
        );
        const targets = resolved.map(({ childContext }) => childContext ?? '');

        if (
          new Set(targets).size > 1 &&
          targets.every((target) => /^\d+$/.test(target))
        ) {
          return {
            ...resolved[0],
            childContext: String(mergeContexts(targets.map(Number))),
          };
        }

        return resolved[0];
      }

      return fragmentFields.has(key) || fragmentCandidates.has(key)
        ? { kind: 'field' }
        : undefined;
    }

    const data = contextOf(context);

    if (!data) {
      return undefined;
    }

    const child = data.children.get(key);

    if (child && opensBlock(child, values)) {
      return resolveChild(child, values);
    }

    return data.fields.has(key) || data.accepts ? { kind: 'field' } : undefined;
  };

  const resolveReferenceNamespaces = (
    field: string,
    context?: string,
    tokenIndex?: number,
  ): readonly string[] => {
    const contextName =
      context === undefined ? '' : (contextOf(context)?.name ?? context);
    const kind = getAudioReferenceKind(contextName, field);

    if (kind) {
      return getKindNamespaces(kind);
    }

    if (
      tokenIndex !== undefined &&
      !isNameTokenAt(contextName, field, tokenIndex)
    ) {
      return [];
    }

    const scoped = getScopedNamespaces(contextName, field);

    return scoped
      ? toCanonicalNamespaces(scoped)
      : (references
          .get(field.toLowerCase())
          ?.filter((namespace) => !isAudioNamespace(namespace)) ?? []);
  };

  return {
    game,
    isStrict: game !== 'bfme1',
    resolve,
    isChecked: (context) =>
      context === ROOT_CONTEXT ||
      context === FRAGMENT_CONTEXT ||
      Boolean(contextOf(context)),
    describeContext: (context) => contextOf(context)?.name ?? context,
    isModuleSlot: (keyword) => moduleSlots.has(keyword.toLowerCase()),
    isEngineBlock: (name) => fileScope.has(name.toLowerCase()),
    getEngineField: (name) => {
      const entry = fields.get(name.toLowerCase());

      return entry && { type: entry.t, used: entry.u === 1 };
    },
    getReferenceNamespaces: createReferenceNamespaceCache(
      resolveReferenceNamespaces,
    ),
    isReferenceNamespace: (namespace) =>
      referenceNamespaces.has(toCanonicalNamespace(namespace).toLowerCase()),
    getContextKeywords: (context) => {
      if (context === ROOT_CONTEXT) {
        return Object.keys(file.fileScope).map((name) => ({
          name,
          kind: 'block' as const,
        }));
      }

      const data = contextOf(context);

      if (!data) {
        return [];
      }

      return [
        ...Array.from(data.children.values(), (child) => ({
          name: child.k,
          kind: 'block' as const,
        })),
        ...Array.from(data.fields)
          .filter(([key]) => !data.children.has(key))
          .map(([, name]) => ({ name, kind: 'field' as const })),
      ];
    },
    getSlotTypes: (slot) =>
      slotTypes.get(slot.toLowerCase()) ?? Object.keys(file.modules),
    getEnumValues: (field) => enumValues.get(field.toLowerCase()) ?? [],
  };
};
