import { FRAGMENT_CONTEXT, ROOT_CONTEXT } from './sageIniSchema';
import type { SageIniSchema } from './sageIniSchema';
import type { SageStatement, SageToken } from './sageIniParser';
import { toCanonicalNamespace, getParentNamespace } from './sageReferenceFields';

export interface Declaration {
  name: SageToken;
  namespace: string;
}

const NOT_NESTED_DEFINITIONS: ReadonlySet<string> = new Set(['object']);

export const getDeclaration = (
  statement: Pick<SageStatement, 'block' | 'context' | 'keyword' | 'values'>,
  schema: SageIniSchema,
): Declaration | undefined => {
  const [name] = statement.values;

  if (!statement.block || !name) {
    return undefined;
  }

  const { context, keyword } = statement;
  const isFileScope =
    context === ROOT_CONTEXT ||
    (context === FRAGMENT_CONTEXT && schema.isEngineBlock(keyword.text));
  const namespace = toCanonicalNamespace(keyword.text);

  if (
    isFileScope ||
    (!NOT_NESTED_DEFINITIONS.has(namespace.toLowerCase()) &&
      !schema.isModuleSlot(keyword.text) &&
      schema.isReferenceNamespace(keyword.text))
  ) {
    return { name, namespace };
  }

  return undefined;
};

export const getParent = (
  statement: Pick<SageStatement, 'block' | 'keyword' | 'values'>,
): { token: SageToken; namespace: string } | undefined => {
  const namespace = getParentNamespace(statement.keyword.text);
  const token = statement.values[1];

  return statement.block && namespace && token
    ? { token, namespace }
    : undefined;
};
