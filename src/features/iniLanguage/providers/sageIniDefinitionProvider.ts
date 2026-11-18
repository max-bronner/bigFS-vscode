import { Position, Range } from 'vscode';
import type { DefinitionProvider, LocationLink } from 'vscode';
import type { SageIniDocuments } from '../../../services/ini/sageIniDocuments';
import type { SageIniIndex } from '../../../services/ini/sageIniIndex';
import { resolveSageSymbol } from '../../../formats/ini/sageIniSymbol';
import { includeExists, resolveIncludeUri } from '../../../services/ini/sageIniInclude';

const LINE_END = 4096;

export const createSageIniDefinitionProvider = (
  documents: SageIniDocuments,
  index: SageIniIndex,
): DefinitionProvider => ({
  async provideDefinition(document, position) {
    const [parsed, schema] = await Promise.all([
      documents.parse(document),
      documents.getSchema(),
    ]);

    const include = parsed.includes.find(
      ({ line, start, end }) =>
        line === position.line &&
        position.character >= start &&
        position.character <= end,
    );

    if (include) {
      const target = resolveIncludeUri(document.uri, include.path);

      if (!(await includeExists(target))) {
        return undefined;
      }

      return [
        {
          originSelectionRange: new Range(
            new Position(include.line, include.start),
            new Position(include.line, include.end),
          ),
          targetUri: target,
          targetRange: new Range(new Position(0, 0), new Position(0, 0)),
          targetSelectionRange: new Range(
            new Position(0, 0),
            new Position(0, 0),
          ),
        },
      ];
    }

    const symbol = resolveSageSymbol(
      parsed,
      schema,
      position.line,
      position.character,
    );

    if (!symbol) {
      return undefined;
    }

    await index.whenReady();

    const macro = index.findMacro(symbol.name);

    if (macro) {
      return [
        {
          originSelectionRange: new Range(
            new Position(symbol.line, symbol.token.start),
            new Position(symbol.line, symbol.token.end),
          ),
          targetUri: macro.uri,
          targetRange: new Range(
            new Position(macro.line, 0),
            new Position(macro.line, LINE_END),
          ),
          targetSelectionRange: new Range(
            new Position(macro.line, 0),
            new Position(macro.line, LINE_END),
          ),
        },
      ];
    }

    const found = symbol.namespaces.flatMap((namespace) =>
      index.findDefinitions(namespace, symbol.name),
    );

    const places = found.filter(
      (place, at) =>
        found.findIndex(
          (other) =>
            other.line === place.line &&
            other.uri.toString() === place.uri.toString(),
        ) === at,
    );

    const originSelectionRange = new Range(
      new Position(symbol.line, symbol.token.start),
      new Position(symbol.line, symbol.token.end),
    );

    return places.map(
      ({ uri, line, endLine }): LocationLink => ({
        originSelectionRange,
        targetUri: uri,
        targetRange: new Range(
          new Position(line, 0),
          new Position(endLine, LINE_END),
        ),
        targetSelectionRange: new Range(
          new Position(line, 0),
          new Position(line, LINE_END),
        ),
      }),
    );
  },
});
