import { Location, Position, Range } from 'vscode';
import type { ReferenceProvider } from 'vscode';
import type { SageIniDocuments } from '../../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../../services/ini/sageIniIndex';
import { resolveSageSymbol } from '../../../formats/ini/sageIniSymbol';

export const createSageIniReferenceProvider = (
  documents: SageIniDocuments,
  index: SageIniIndex,
): ReferenceProvider => ({
  async provideReferences(document, position, context) {
    const [parsed, schema] = await Promise.all([
      documents.parse(document),
      documents.getSchema(),
    ]);

    const defined = parsed.macros.find(
      ({ line, start, end }) =>
        line === position.line &&
        position.character >= start &&
        position.character <= end,
    );

    const symbol = defined
      ? { name: defined.name, namespaces: [] as readonly string[] }
      : resolveSageSymbol(parsed, schema, position.line, position.character);

    if (!symbol) {
      return undefined;
    }

    await index.whenReady();
    await index.syncOpenDocuments();

    const macro = index.findMacro(symbol.name);

    if (macro) {
      const uses = index.findMacroUses(symbol.name).map(
        ({ uri, line, start, end }) =>
          new Location(
            uri,
            new Range(new Position(line, start), new Position(line, end)),
          ),
      );

      return context.includeDeclaration
        ? [
            new Location(
              macro.uri,
              new Range(
                new Position(macro.line, 0),
                new Position(macro.line, 0),
              ),
            ),
            ...uses,
          ]
        : uses;
    }

    const uses = symbol.namespaces.flatMap((namespace) =>
      index.findReferences(namespace, symbol.name),
    );

    const locations = uses.map(
      ({ uri, line, start, end }) =>
        new Location(
          uri,
          new Range(new Position(line, start), new Position(line, end)),
        ),
    );

    if (!context.includeDeclaration) {
      return locations;
    }

    const declarations = symbol.namespaces.flatMap((namespace) =>
      index.findDefinitions(namespace, symbol.name),
    );

    return [
      ...declarations.map(
        ({ uri, line }) =>
          new Location(
            uri,
            new Range(new Position(line, 0), new Position(line, 0)),
          ),
      ),
      ...locations,
    ];
  },
});
