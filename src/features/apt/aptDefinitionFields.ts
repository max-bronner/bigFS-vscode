import type { Uri } from 'vscode';
import type { SageIniIndex } from '../../services/ini/sageIniIndex';
import type { SageDefinition } from '../../services/ini/sageIniTables';

export type SuggestionIndex = Pick<SageIniIndex, 'getNames' | 'findDefinitions'>;

export type ReadText = (uri: Uri) => Promise<string>;

export interface DefinitionFields {
  definition: Pick<SageDefinition, 'uri' | 'line' | 'name' | 'keyword'>;
  fields: Map<string, string>;
}

export const readFields = (lines: readonly string[]): Map<string, string> => {
  const fields = new Map<string, string>();

  for (const line of lines) {
    const match = /^\s*(\w+)\s*=\s*(.*?)\s*(?:;|\/\/|$)/.exec(line);

    if (match && !fields.has(match[1].toLowerCase())) {
      fields.set(match[1].toLowerCase(), match[2].trim());
    }
  }
  return fields;
};

export const readDefinitionFields = async (
  index: SuggestionIndex,
  namespace: string,
  read: ReadText,
): Promise<DefinitionFields[]> => {
  const definitions = index
    .getNames(namespace)
    .flatMap((name) => index.findDefinitions(namespace, name).slice(0, 1));
  const texts = new Map<string, Promise<string[] | undefined>>();
  const lines = (uri: Uri) => {
    const key = uri.toString();

    if (!texts.has(key)) {
      texts.set(
        key,
        read(uri).then(
          (text) => text.split(/\r?\n/),
          () => undefined,
        ),
      );
    }
    return texts.get(key)!;
  };
  const found: DefinitionFields[] = [];

  for (const definition of definitions) {
    const body = (await lines(definition.uri))?.slice(
      definition.line + 1,
      definition.endLine,
    );

    if (body) {
      found.push({ definition, fields: readFields(body) });
    }
  }
  return found;
};
