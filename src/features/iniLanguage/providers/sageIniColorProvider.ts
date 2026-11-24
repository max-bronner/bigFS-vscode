import { Color, ColorInformation, ColorPresentation, Range, TextEdit } from 'vscode';
import type { DocumentColorProvider } from 'vscode';
import type { SageIniDocuments } from '../../../services/ini/sageIniDocuments';
import {
  findColorValue,
  formatColorValue,
} from '../../../formats/ini/sageIniColors';

export const createSageIniColorProvider = (
  documents: SageIniDocuments,
): DocumentColorProvider => ({
  async provideDocumentColors(document) {
    const [parsed, schema] = await Promise.all([
      documents.parse(document),
      documents.getSchema(),
    ]);

    return parsed.statements.flatMap((statement) => {
      const value = findColorValue(statement, schema);

      if (!value) {
        return [];
      }

      const { red, green, blue, alpha } = value.color;

      return [
        new ColorInformation(
          new Range(statement.line, value.start, statement.line, value.end),
          new Color(red, green, blue, alpha),
        ),
      ];
    });
  },

  async provideColorPresentations(color, { document, range }) {
    const [parsed, schema] = await Promise.all([
      documents.parse(document),
      documents.getSchema(),
    ]);
    const statement = parsed.statements.find(
      ({ line }) => line === range.start.line,
    );
    const value = statement && findColorValue(statement, schema);

    if (!value) {
      return [];
    }

    const line = document.lineAt(range.start.line).text;
    const edit = formatColorValue(line, value, color);
    const text = line.slice(value.start, edit.start) + edit.text;
    const presentation = new ColorPresentation(text);

    presentation.textEdit = TextEdit.replace(
      new Range(range.start.line, value.start, range.start.line, edit.end),
      text,
    );

    return [presentation];
  },
});
