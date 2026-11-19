import type { Uri } from 'vscode';
import type {
  EntryBodyToken,
  FileEntries,
} from '../../formats/ini/sageIniEntries';
import type { SageString } from '../../formats/str/sageStringTable';

export interface SageDefinition {
  uri: Uri;
  line: number;
  endLine: number;
  keyword: string;
  start: number;
  end: number;
  name: string;
}

export interface SageMacro {
  name: string;
  value: string;
  start: number;
  end: number;
  uri: Uri;
  line: number;
}

export interface SageStringPlace extends SageString {
  uri: Uri;
  language?: string;
}

export interface SageReference {
  uri: Uri;
  line: number;
  start: number;
  end: number;
  field: string;
}

export interface SageBodyToken extends EntryBodyToken {
  uri: Uri;
}

interface FileContribution {
  definitions: Map<string, Set<string>>;
  references: Map<string, Set<string>>;
  macros: Set<string>;
  constantUses: Set<string>;
  bodyTokens: Set<string>;
  strings: Set<string>;
}

export interface SageIniTables {
  readonly definitions: Map<string, Map<string, SageDefinition[]>>;
  readonly references: Map<string, Map<string, SageReference[]>>;
  readonly macros: Map<string, SageMacro>;
  readonly constantUses: Map<string, SageReference[]>;
  readonly bodyTokens: Map<string, SageBodyToken[]>;
  readonly strings: Map<string, SageStringPlace[]>;
  replaceFile(uri: Uri, entries: FileEntries): void;
  replaceStrings(
    uri: Uri,
    records: ReadonlyMap<string, SageString>,
    language?: string,
  ): void;
  purge(rootKey: string): void;
  clear(): void;
}

const pushTo = <T>(table: Map<string, T[]>, key: string, value: T): void => {
  const list = table.get(key);

  if (list) {
    list.push(value);
  } else {
    table.set(key, [value]);
  }
};

const record = <T>(
  table: Map<string, Map<string, T[]>>,
  written: Map<string, Set<string>>,
  namespace: string,
  name: string,
  value: T,
): void => {
  const namespaceKey = namespace.toLowerCase();
  const nameKey = name.toLowerCase();
  const byName = table.get(namespaceKey) ?? new Map<string, T[]>();
  const names = written.get(namespaceKey) ?? new Set<string>();

  pushTo(byName, nameKey, value);
  table.set(namespaceKey, byName);
  names.add(nameKey);
  written.set(namespaceKey, names);
};

const createContribution = (): FileContribution => ({
  definitions: new Map(),
  references: new Map(),
  macros: new Set(),
  constantUses: new Set(),
  bodyTokens: new Set(),
  strings: new Set(),
});

const dropFromLists = <T extends { uri: Uri }>(
  table: Map<string, T[]>,
  keys: Iterable<string>,
  isDropped: (place: T) => boolean,
): void => {
  for (const key of keys) {
    const places = table.get(key);

    if (!places) {
      continue;
    }

    const kept = places.filter((place) => !isDropped(place));

    if (kept.length) {
      table.set(key, kept);
    } else {
      table.delete(key);
    }
  }
};

const dropFromNamespaces = <T extends { uri: Uri }>(
  table: Map<string, Map<string, T[]>>,
  written: Iterable<Map<string, Set<string>>>,
  isDropped: (place: T) => boolean,
): void => {
  const namesByNamespace = new Map<string, Set<string>>();

  for (const namespaces of written) {
    for (const [namespace, names] of namespaces) {
      const merged = namesByNamespace.get(namespace) ?? new Set<string>();

      names.forEach((name) => merged.add(name));
      namesByNamespace.set(namespace, merged);
    }
  }

  for (const [namespace, names] of namesByNamespace) {
    const byName = table.get(namespace);

    if (byName) {
      dropFromLists(byName, names, isDropped);
    }
  }
};

export const createSageIniTables = (): SageIniTables => {
  const definitions = new Map<string, Map<string, SageDefinition[]>>();
  const references = new Map<string, Map<string, SageReference[]>>();
  const macros = new Map<string, SageMacro>();
  const macroDefinitions = new Map<string, SageMacro[]>();
  const constantUses = new Map<string, SageReference[]>();
  const bodyTokens = new Map<string, SageBodyToken[]>();
  const strings = new Map<string, SageStringPlace[]>();

  const contributions = new Map<string, FileContribution>();

  const purgeFiles = (fileKeys: ReadonlySet<string>): void => {
    const dropped = [...fileKeys].map((key) => contributions.get(key)!);
    const isDropped = ({ uri }: { uri: Uri }): boolean =>
      fileKeys.has(uri.path.toLowerCase());

    dropFromNamespaces(
      definitions,
      dropped.map((each) => each.definitions),
      isDropped,
    );
    dropFromNamespaces(
      references,
      dropped.map((each) => each.references),
      isDropped,
    );
    dropFromLists(
      constantUses,
      dropped.flatMap((each) => [...each.constantUses]),
      isDropped,
    );
    dropFromLists(
      bodyTokens,
      dropped.flatMap((each) => [...each.bodyTokens]),
      isDropped,
    );
    dropFromLists(
      strings,
      dropped.flatMap((each) => [...each.strings]),
      isDropped,
    );

    for (const key of dropped.flatMap((each) => [...each.macros])) {
      const kept = (macroDefinitions.get(key) ?? []).filter(
        (macro) => !isDropped(macro),
      );
      const last = kept[kept.length - 1];

      if (last) {
        macroDefinitions.set(key, kept);
        macros.set(key, last);
      } else {
        macroDefinitions.delete(key);
        macros.delete(key);
      }
    }

    fileKeys.forEach((key) => contributions.delete(key));
  };

  const purge = (rootKey: string): void => {
    const fileKeys = new Set<string>();

    for (const key of contributions.keys()) {
      if (key === rootKey || key.startsWith(`${rootKey}/`)) {
        fileKeys.add(key);
      }
    }

    if (fileKeys.size) {
      purgeFiles(fileKeys);
    }
  };

  return {
    definitions,
    references,
    macros,
    constantUses,
    bodyTokens,
    strings,

    purge,

    clear() {
      [definitions, references, macros, constantUses, bodyTokens, strings].forEach(
        (table) => table.clear(),
      );
      macroDefinitions.clear();
      contributions.clear();
    },

    replaceFile(uri, entries) {
      const fileKey = uri.path.toLowerCase();
      const written = createContribution();

      purge(fileKey);

      for (const macro of entries.macros) {
        const key = macro.name.toLowerCase();

        const defined = { ...macro, uri };

        macros.set(key, defined);
        pushTo(macroDefinitions, key, defined);
        written.macros.add(key);
      }

      for (const token of entries.bodyTokens) {
        pushTo(bodyTokens, token.text, { ...token, uri });
        written.bodyTokens.add(token.text);
      }

      for (const { namespace, ...definition } of entries.definitions) {
        record(definitions, written.definitions, namespace, definition.name, {
          uri,
          ...definition,
        });
      }

      for (const { key, ...use } of entries.constantUses) {
        pushTo(constantUses, key, { uri, ...use });
        written.constantUses.add(key);
      }

      for (const { namespace, name, ...place } of entries.references) {
        record(references, written.references, namespace, name, {
          uri,
          ...place,
        });
      }

      contributions.set(fileKey, written);
    },

    replaceStrings(uri, records, language) {
      const fileKey = uri.path.toLowerCase();
      const written = createContribution();

      purge(fileKey);

      for (const [key, each] of records) {
        pushTo(strings, key, { ...each, uri, language });
        written.strings.add(key);
      }

      contributions.set(fileKey, written);
    },
  };
};
