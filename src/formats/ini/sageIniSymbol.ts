import { getDeclaration, getParent } from './sageIniNames';
import { findReferencedNames } from './sageAudioValues';
import type { SageIniSchema } from './sageIniSchema';
import type { SageDocument, SageStatement, SageToken } from './sageIniParser';

export interface SageSymbol {
  token: SageToken;
  line: number;
  name: string;
  namespaces: readonly string[];
  isDeclaration: boolean;
}

const tokenAt = (
  statement: SageStatement,
  character: number,
): SageToken | undefined =>
  [statement.keyword, ...statement.values].find(
    (token) => character >= token.start && character <= token.end,
  );

export const resolveSageSymbol = (
  { statements }: SageDocument,
  schema: SageIniSchema,
  line: number,
  character: number,
): SageSymbol | undefined => {
  const statement = statements.find((candidate) => candidate.line === line);

  if (!statement) {
    return undefined;
  }

  const token = tokenAt(statement, character);

  if (!token) {
    return undefined;
  }

  if (statement.block) {
    const declaration = getDeclaration(statement, schema);
    const parent = getParent(statement);

    if (parent && token === parent.token) {
      return {
        token,
        line,
        name: token.text,
        namespaces: [parent.namespace],
        isDeclaration: false,
      };
    }

    if (
      !declaration ||
      (token !== statement.keyword && token !== declaration.name)
    ) {
      return undefined;
    }

    return {
      token: declaration.name,
      line,
      name: declaration.name.text,
      namespaces: [declaration.namespace],
      isDeclaration: true,
    };
  }

  if (token === statement.keyword) {
    return undefined;
  }

  const inside = findReferencedNames(statement, schema).find(
    (candidate) => character >= candidate.start && character <= candidate.end,
  );

  if (
    inside &&
    (inside.isAudio || inside.start !== token.start || inside.end !== token.end)
  ) {
    return {
      token: { text: inside.name, start: inside.start, end: inside.end },
      line,
      name: inside.name,
      namespaces: inside.namespaces,
      isDeclaration: false,
    };
  }

  return {
    token,
    line,
    name: token.text,
    namespaces: schema.getReferenceNamespaces(
      statement.keyword.text,
      statement.context,
      statement.values.indexOf(token),
    ),
    isDeclaration: false,
  };
};
