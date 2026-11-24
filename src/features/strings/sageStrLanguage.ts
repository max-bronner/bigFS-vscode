import * as vscode from 'vscode';
import { createKeyedDebouncer } from '../../core/debounce';
import { parseCsf, writeCsf } from '../../formats/csf/csf';
import { parseStringRecords, quoteStringText } from '../../formats/str/sageStringRecords';
import { findUnencodableCharacters } from '../../core/windows1252';

export const STR_LANGUAGE = 'sage-str';

const selector: vscode.DocumentSelector = { language: STR_LANGUAGE };

export const findStrProblems = (
  source: string,
): { start: number; end: number; message: string; isError: boolean }[] => {
  const problems: {
    start: number;
    end: number;
    message: string;
    isError: boolean;
  }[] = [];
  const firsts = new Map<string, number>();

  for (const record of parseStringRecords(source)) {
    const key = record.label.toLowerCase();
    const first = firsts.get(key);
    const at = record.labelSpan;

    if (/\s|"/.test(record.label)) {
      problems.push({
        ...at,
        message:
          'A label cannot hold spaces or quotes; is a line missing before it?',
        isError: true,
      });
    }

    if (first !== undefined) {
      problems.push({
        ...at,
        message: `Duplicate of the label on line ${first + 1}; the game uses the first`,
        isError: false,
      });
    } else {
      firsts.set(key, record.line);
    }

    if (!record.hasEnd) {
      problems.push({
        ...at,
        message: 'This record has no END',
        isError: true,
      });
    }

    if (record.text === undefined) {
      problems.push({
        ...at,
        message: 'This record has no quoted text',
        isError: false,
      });
    } else if (record.isUnclosed && record.textSpan) {
      problems.push({
        start: record.textSpan.start,
        end: record.textSpan.start + 1,
        message: 'The text has no closing quote',
        isError: true,
      });
    }
  }

  return problems;
};

export const csfToStr = (
  bytes: Uint8Array,
  eol = '\r\n',
): { text: string; dropped: number; unencodable: string[] } => {
  const file = parseCsf(bytes);
  let dropped = 0;
  const text = file.labels
    .map((label) => {
      dropped +=
        Math.max(0, label.strings.length - 1) +
        (label.strings[0]?.speech ? 1 : 0);

      return [
        label.name,
        ...(label.strings.length
          ? [quoteStringText(label.strings[0].text)]
          : []),
        'END',
        '',
      ].join(eol);
    })
    .join(eol);

  return { text, dropped, unencodable: findUnencodableCharacters(text) };
};

export const strToCsf = (source: string): Uint8Array =>
  writeCsf({
    version: 3,
    reserved: 0,
    language: 0,
    labels: parseStringRecords(source).map((record) => ({
      name: record.label,
      strings: record.text === undefined ? [] : [{ text: record.text }],
    })),
  });

const REFRESH_DELAY_MS = 250;

export const registerSageStrLanguage = (context: vscode.ExtensionContext): void => {
  const diagnostics = vscode.languages.createDiagnosticCollection(STR_LANGUAGE);
  const refresh = (document: vscode.TextDocument) => {
    if (document.languageId !== STR_LANGUAGE) {
      return;
    }

    diagnostics.set(
      document.uri,
      findStrProblems(document.getText()).map((problem) => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(
            document.positionAt(problem.start),
            document.positionAt(problem.end),
          ),
          problem.message,
          problem.isError
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
        );

        diagnostic.source = 'bigFS';

        return diagnostic;
      }),
    );
  };

  vscode.workspace.textDocuments.forEach(refresh);

  const refreshSoon = createKeyedDebouncer(
    refresh,
    REFRESH_DELAY_MS,
    (document: vscode.TextDocument) => document.uri.toString(),
  );

  context.subscriptions.push(
    diagnostics,
    { dispose: refreshSoon.dispose },
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) =>
      refreshSoon.schedule(event.document),
    ),
    vscode.workspace.onDidCloseTextDocument((document) => {
      refreshSoon.cancel(document.uri.toString());
      diagnostics.delete(document.uri);
    }),
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols: (document) =>
        parseStringRecords(document.getText()).map((record) => {
          const range = new vscode.Range(
            document.positionAt(record.span.start),
            document.positionAt(
              Math.max(record.span.start, record.span.end - 1),
            ),
          );
          const name = new vscode.Range(
            document.positionAt(record.labelSpan.start),
            document.positionAt(record.labelSpan.end),
          );

          return new vscode.DocumentSymbol(
            record.label,
            record.text ?? '',
            vscode.SymbolKind.String,
            range,
            name,
          );
        }),
    }),
    vscode.languages.registerFoldingRangeProvider(selector, {
      provideFoldingRanges: (document) =>
        parseStringRecords(document.getText()).flatMap((record) => {
          const start = document.positionAt(record.span.start).line;
          const end = document.positionAt(
            Math.max(record.span.start, record.span.end - 1),
          ).line;

          return end > start ? [new vscode.FoldingRange(start, end)] : [];
        }),
    }),
  );
};
