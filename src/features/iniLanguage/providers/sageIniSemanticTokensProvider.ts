import { SemanticTokensLegend, SemanticTokensBuilder } from 'vscode';
import type { DocumentSemanticTokensProvider } from 'vscode';
import type { SageIniDocuments } from '../../../services/ini/sageIniDocuments';
import type { SageIniSchema } from '../../../formats/ini/sageIniSchema';
import type { SageStatement, SageToken } from '../../../formats/ini/sageIniParser';

export const SAGE_INI_LEGEND = new SemanticTokensLegend(
  [
    'type',
    'class',
    'label',
    'property',
    'variable',
    'enumMember',
    'parameter',
    'number',
  ],
  ['defaultLibrary', 'deprecated', 'declaration'],
);

const SCREAMING_SNAKE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const NUMERIC = /^[-+]?\d+(?:\.\d+)?%?$/;
const COMPONENT = /^([A-Za-z_][A-Za-z0-9_]*):(.*)$/;

const COMPONENT_TYPES = new Set(['Coord3D', 'Color', 'NumPair']);

const addValues = (
  builder: SemanticTokensBuilder,
  statement: SageStatement,
  schema: SageIniSchema,
): void => {
  const engineField = schema.getEngineField(statement.keyword.text);
  const references = schema.getReferenceNamespaces(
    statement.keyword.text,
    statement.context,
  );
  const hasComponents =
    engineField !== undefined && COMPONENT_TYPES.has(engineField.type);

  const mark = (token: SageToken, type: string, modifiers: string[] = []) =>
    builder.push(
      statement.line,
      token.start,
      token.end - token.start,
      SAGE_INI_LEGEND.tokenTypes.indexOf(type),
      modifiers.reduce(
        (bits, name) =>
          bits | (1 << SAGE_INI_LEGEND.tokenModifiers.indexOf(name)),
        0,
      ),
    );

  statement.values.forEach((token) => {
    const component = COMPONENT.exec(token.text);

    if (hasComponents && component) {
      mark(
        {
          text: component[1],
          start: token.start,
          end: token.start + component[1].length,
        },
        'parameter',
      );

      return;
    }

    if (NUMERIC.test(token.text)) {
      mark(token, 'number');
      return;
    }

    if (references.length) {
      mark(token, 'variable');
      return;
    }

    if (SCREAMING_SNAKE.test(token.text)) {
      mark(token, 'enumMember');
    }
  });
};

export const createSageIniSemanticTokensProvider = (
  documents: SageIniDocuments,
): DocumentSemanticTokensProvider => ({
  async provideDocumentSemanticTokens(document) {
    const [{ statements }, schema] = await Promise.all([
      documents.parse(document),
      documents.getSchema(),
    ]);
    const builder = new SemanticTokensBuilder(SAGE_INI_LEGEND);

    const mark = (
      line: number,
      token: SageToken,
      type: string,
      modifiers: string[] = [],
    ) =>
      builder.push(
        line,
        token.start,
        token.end - token.start,
        SAGE_INI_LEGEND.tokenTypes.indexOf(type),
        modifiers.reduce(
          (bits, name) =>
            bits | (1 << SAGE_INI_LEGEND.tokenModifiers.indexOf(name)),
          0,
        ),
      );

    statements.forEach((statement) => {
      const { block, keyword, line } = statement;

      if (!block) {
        const engineField = schema.getEngineField(keyword.text);

        mark(line, keyword, 'property', [
          ...(engineField ? ['defaultLibrary'] : []),
          ...(engineField && !engineField.used ? ['deprecated'] : []),
        ]);

        addValues(builder, statement, schema);

        return;
      }

      mark(line, keyword, 'type', [
        ...(schema.isEngineBlock(keyword.text) ? ['defaultLibrary'] : []),
      ]);

      if (block.moduleType) {
        mark(line, statement.values[0], 'class');

        if (statement.values[1]) {
          mark(line, statement.values[1], 'label');
        }

        return;
      }

      statement.values.forEach((token, at) =>
        mark(
          line,
          token,
          'class',
          at === 0 && statement.context === '<root>' ? ['declaration'] : [],
        ),
      );
    });

    return builder.build();
  },
});
