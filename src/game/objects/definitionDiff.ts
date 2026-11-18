import { stripComment } from '../../formats/ini/sageIniParser';
import type { SageBlock, SageDocument } from '../../formats/ini/sageIniParser';

export interface FieldChange {
  path: string;
  before?: string;
  after?: string;
}

export interface DefinitionDiff {
  added: string[];
  removed: string[];
  changed: { name: string; changes: FieldChange[] }[];
}

const definitionKey = (block: SageBlock) =>
  `${block.keyword} ${block.name?.split(/\s+/)[0] ?? ''}`.trim();

const segmentOf = (block: SageBlock, count: number) =>
  block.moduleTag
    ? `${block.keyword}[${block.moduleTag}]`
    : count > 1
      ? `${block.keyword}#${count}`
      : block.keyword;

export const flattenDefinition = (
  document: SageDocument,
  lines: string[],
  top: SageBlock,
): Map<string, string> => {
  const owners = new Map<number, string>();
  const paths = new Map<SageBlock, string>();
  const values = new Map<string, string>();
  const walk = (block: SageBlock, path: string) => {
    const seen = new Map<string, number>();

    for (let line = block.startLine + 1; line < block.endLine; line++) {
      owners.set(line, path);
    }
    for (const child of block.children) {
      const count = (seen.get(child.keyword.toLowerCase()) ?? 0) + 1;

      seen.set(child.keyword.toLowerCase(), count);
      paths.set(child, `${path}${segmentOf(child, count)}`);
      walk(child, `${path}${segmentOf(child, count)}/`);
    }
  };

  walk(top, '');

  const counts = new Map<string, number>();

  for (const statement of document.statements) {
    if (statement.line <= top.startLine || statement.line >= top.endLine) {
      continue;
    }

    const owner = owners.get(statement.line) ?? '';
    const base = `${owner}${statement.keyword.text}`;
    const count = (counts.get(base.toLowerCase()) ?? 0) + 1;
    const text = stripComment(lines[statement.line])
      .replace(/^[^=]*=?/, '')
      .trim()
      .replace(/\s+/g, ' ');

    counts.set(base.toLowerCase(), count);
    const block = statement.block && paths.get(statement.block);

    values.set(block ?? (count > 1 ? `${base}#${count}` : base), text);
  }
  return values;
};

const definitionsOf = (document: SageDocument, lines: string[]) =>
  new Map(
    document.blocks
      .filter((block) => block.name)
      .map((block) => [
        definitionKey(block).toLowerCase(),
        {
          name: definitionKey(block),
          values: flattenDefinition(document, lines, block),
        },
      ]),
  );

export const diffDefinitions = (
  base: { document: SageDocument; lines: string[] },
  mod: { document: SageDocument; lines: string[] },
): DefinitionDiff => {
  const before = definitionsOf(base.document, base.lines);
  const after = definitionsOf(mod.document, mod.lines);
  const diff: DefinitionDiff = { added: [], removed: [], changed: [] };

  for (const [key, { name, values }] of after) {
    const old = before.get(key);

    if (!old) {
      diff.added.push(name);
      continue;
    }

    const changes: FieldChange[] = [];

    for (const [path, value] of values) {
      const was = old.values.get(path);

      if (was !== value) {
        changes.push({ path, before: was, after: value });
      }
    }
    for (const [path, value] of old.values) {
      if (!values.has(path)) {
        changes.push({ path, before: value });
      }
    }
    if (changes.length) {
      diff.changed.push({ name, changes });
    }
  }
  for (const [key, { name }] of before) {
    if (!after.has(key)) {
      diff.removed.push(name);
    }
  }
  return diff;
};
