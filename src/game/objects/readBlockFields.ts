import type { SageBlock, SageDocument } from '../../formats/ini/sageIniParser';

export const readBlockFields = (parsed: SageDocument, block: SageBlock): Map<string, string[][]> => {
  const fields = new Map<string, string[][]>();
  const isInChild = (line: number) =>
    block.children.some((child) => child.startLine <= line && line <= child.endLine);

  for (const statement of parsed.statements) {
    if (
      statement.kind !== 'field' ||
      statement.line <= block.startLine ||
      statement.line >= block.endLine ||
      isInChild(statement.line)
    ) {
      continue;
    }

    const key = statement.keyword.text.toLowerCase();

    fields.set(key, [...(fields.get(key) ?? []), statement.values.map((value) => value.text)]);
  }
  return fields;
};
