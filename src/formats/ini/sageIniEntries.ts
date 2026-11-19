import { findAssetReferences } from './sageIniAssets';
import { findReferencedNames } from './sageAudioValues';
import { getDeclaration } from './sageIniNames';
import { CONSTANT_NAME } from './sageReferenceFields';
import { isFragmentPath, parseSageIni } from './sageIniParser';
import type { SageIniSchema } from './sageIniSchema';

export const FILE_USES = '#file';

export interface EntryDefinition {
  namespace: string;
  keyword: string;
  name: string;
  line: number;
  endLine: number;
  start: number;
  end: number;
}

export interface EntryReference {
  namespace: string;
  name: string;
  line: number;
  start: number;
  end: number;
  field: string;
}

export interface EntryMacro {
  name: string;
  value: string;
  line: number;
  start: number;
  end: number;
}

export interface EntryConstantUse {
  key: string;
  line: number;
  start: number;
  end: number;
  field: string;
}

export interface EntryBodyToken {
  macro: string;
  text: string;
  line: number;
  start: number;
  end: number;
}

export interface FileEntries {
  definitions: EntryDefinition[];
  references: EntryReference[];
  macros: EntryMacro[];
  constantUses: EntryConstantUse[];
  bodyTokens: EntryBodyToken[];
}

const BODY_TOKEN = /[^\s,()]+/g;

export const collectEntries = (
  text: string,
  entryPath: string,
  schema: SageIniSchema,
): FileEntries => {
  const parsed = parseSageIni(text.split(/\r?\n/), schema, {
    isFragment: isFragmentPath(entryPath),
  });
  const entries: FileEntries = {
    definitions: [],
    references: [],
    macros: [],
    constantUses: [],
    bodyTokens: [],
  };

  for (const macro of parsed.macros) {
    const macroKey = macro.name.toLowerCase();

    entries.macros.push({
      name: macro.name,
      value: macro.value,
      line: macro.line,
      start: macro.start,
      end: macro.end,
    });

    for (const match of macro.value.matchAll(BODY_TOKEN)) {
      const start = macro.valueStart + match.index;
      const end = start + match[0].length;

      if (match[0].startsWith('#')) {
        continue;
      }

      entries.bodyTokens.push({
        macro: macroKey,
        text: match[0].toLowerCase(),
        line: macro.line,
        start,
        end,
      });

      if (CONSTANT_NAME.test(match[0])) {
        entries.constantUses.push({
          key: match[0].toLowerCase(),
          line: macro.line,
          start,
          end,
          field: `#define ${macro.name}`,
        });
      }
    }
  }

  for (const statement of parsed.statements) {
    const { block, keyword, line, values } = statement;
    const declaration = getDeclaration(statement, schema);

    if (block && declaration) {
      entries.definitions.push({
        namespace: declaration.namespace,
        keyword: keyword.text,
        name: declaration.name.text,
        line,
        endLine: block.endLine,
        start: declaration.name.start,
        end: declaration.name.end,
      });
    }

    if (!block) {
      for (const value of values) {
        if (CONSTANT_NAME.test(value.text)) {
          entries.constantUses.push({
            key: value.text.toLowerCase(),
            line,
            start: value.start,
            end: value.end,
            field: keyword.text,
          });
        }
      }
    }

    for (const reference of findReferencedNames(statement, schema)) {
      for (const namespace of reference.namespaces) {
        entries.references.push({
          namespace,
          name: reference.name,
          line,
          start: reference.start,
          end: reference.end,
          field: keyword.text,
        });
      }
    }
  }

  for (const asset of findAssetReferences(parsed)) {
    if (asset.kind === 'model' || asset.kind === 'animation') {
      for (const candidate of asset.candidates) {
        entries.references.push({
          namespace: FILE_USES,
          name: candidate,
          line: asset.line,
          start: asset.start,
          end: asset.end,
          field: asset.kind,
        });
      }
    } else if (asset.kind === 'texture') {
      entries.references.push({
        namespace: FILE_USES,
        name: asset.candidates[0],
        line: asset.line,
        start: asset.start,
        end: asset.end,
        field: asset.kind,
      });
    }
  }

  return entries;
};

export const reachedThroughMacros = <T extends { macro: string }>(
  holders: readonly T[],
  bodyTokens: ReadonlyMap<string, readonly T[]>,
  isWritten: (macro: string) => boolean,
): T[] => {
  const reaches = (macro: string, seen: Set<string>): boolean => {
    if (seen.has(macro)) {
      return false;
    }

    seen.add(macro);

    return (
      isWritten(macro) ||
      (bodyTokens.get(macro) ?? []).some((holder) =>
        reaches(holder.macro, seen),
      )
    );
  };

  return holders.filter((holder) => reaches(holder.macro, new Set()));
};
