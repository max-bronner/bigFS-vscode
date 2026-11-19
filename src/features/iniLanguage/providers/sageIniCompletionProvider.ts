import { CompletionItem, CompletionItemKind, Range } from 'vscode';
import type { CompletionItemProvider, Position, TextDocument } from 'vscode';
import type { SageIniDocuments } from '../../../services/ini/sageIniDocuments';
import type { SageIniSchema } from '../../../formats/ini/sageIniSchema';
import { stripComment, tokenize } from '../../../formats/ini/sageIniParser';
import type { SageBlock, SageDocument } from '../../../formats/ini/sageIniParser';
import type { SageIniIndex } from '../../../services/ini/sageIniIndex';

const getWordRangeAt = (
  document: TextDocument,
  position: Position,
): Range | undefined => {
  const range = document.getWordRangeAtPosition(position, /[A-Za-z0-9_]+/);

  return range;
};

const findContextAt = (
  { blocks, fileContext }: SageDocument,
  line: number,
): { context: string; slot?: string } => {
  let context = fileContext;
  let slot: string | undefined;

  const descend = (candidates: readonly SageBlock[]) => {
    for (const block of candidates) {
      if (line <= block.startLine || line > block.endLine) {
        continue;
      }

      context = block.context;
      slot = block.moduleType ? block.keyword : undefined;
      descend(block.children);

      return;
    }
  };

  descend(blocks);

  return { context, slot };
};

const toItem = (
  label: string,
  kind: CompletionItemKind,
  detail: string,
  range?: Range,
): CompletionItem => {
  const item = new CompletionItem(label, kind);

  item.detail = detail;

  if (range) {
    item.range = range;
  }

  return item;
};

export const createSageIniCompletionProvider = (
  documents: SageIniDocuments,
  index: SageIniIndex,
): CompletionItemProvider => ({
  async provideCompletionItems(document, position) {
    const [parsed, schema] = await Promise.all([
      documents.parse(document),
      documents.getSchema(),
    ]);

    const line = document.lineAt(position.line).text;
    const before = stripComment(line).slice(0, position.character);
    const tokens = tokenize(before);
    const range = getWordRangeAt(document, position);

    const onKeyword =
      tokens.length === 0 ||
      (tokens.length === 1 && position.character <= tokens[0].end);

    const { context } = findContextAt(parsed, position.line);

    if (onKeyword) {
      const keywords = schema.getContextKeywords(context);

      return keywords.map(({ name, kind }) =>
        toItem(
          name,
          kind === 'block'
            ? CompletionItemKind.Class
            : CompletionItemKind.Property,
          kind === 'block'
            ? `block in ${schema.describeContext(context)}`
            : describeField(schema, name, context),
          range,
        ),
      );
    }

    const keyword = tokens[0].text;

    if (schema.isModuleSlot(keyword) && tokens.length <= 2) {
      return schema
        .getSlotTypes(keyword)
        .map((type) =>
          toItem(type, CompletionItemKind.Class, `${keyword} module`, range),
        );
    }

    const namespaces = schema.getReferenceNamespaces(keyword, context);

    if (namespaces.length) {
      await index.whenReady();

      return namespaces.flatMap((namespace) =>
        index
          .getNames(namespace)
          .map((name) =>
            toItem(name, CompletionItemKind.Reference, namespace, range),
          ),
      );
    }

    await index.whenReady();

    return [
      ...schema
        .getEnumValues(keyword)
        .map((value) =>
          toItem(value, CompletionItemKind.EnumMember, keyword, range),
        ),
      ...index
        .getMacros()
        .map(({ name, value }) =>
          toItem(name, CompletionItemKind.Constant, `= ${value}`, range),
        ),
    ];
  },
});

const describeField = (
  schema: SageIniSchema,
  name: string,
  context: string,
): string => {
  const engineField = schema.getEngineField(name);

  if (!engineField) {
    return `field in ${schema.describeContext(context)}`;
  }

  return engineField.used
    ? engineField.type
    : `${engineField.type} — not read by the engine`;
};
