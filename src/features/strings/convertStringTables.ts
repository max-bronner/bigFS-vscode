import * as vscode from 'vscode';
import { OUTPUT_FIELD, createReview } from '../../core/converterDialog';
import { CONVERTER_FILE_TYPES } from '../../core/converterFileTypes';
import type { ConverterValues } from '../../core/converterDialog';
import { decodeIniText, encodeWindows1252 } from '../../core/windows1252';
import { collectConverterFiles } from '../../platform/collectConverterFiles';
import { resolveOutputUris } from '../../platform/resolveOutputUris';
import { openConverterDialog } from '../../platform/webview/openConverterDialog';
import type { ArchiveModel } from '../../services/archives/archiveModel';
import { toUris } from '../../services/archives/commandTarget';
import { csfToStr, strToCsf } from './sageStrLanguage';

const getFileName = (uri: vscode.Uri) => uri.path.slice(uri.path.lastIndexOf('/') + 1);

const getOutputName = (uri: vscode.Uri) =>
  getFileName(uri).replace(/\.(csf|str)$/i, (extension) =>
    extension.toLowerCase() === '.csf' ? '.str' : '.csf',
  );

const convertOne = async (source: vscode.Uri, output: vscode.Uri): Promise<string[]> => {
  const bytes = await vscode.workspace.fs.readFile(source);

  if (!/\.csf$/i.test(source.path)) {
    await vscode.workspace.fs.writeFile(output, strToCsf(decodeIniText(bytes)));
    return [];
  }

  const { text, dropped, unencodable } = csfToStr(bytes);
  const notes: string[] = [];

  await vscode.workspace.fs.writeFile(output, encodeWindows1252(text, 0x3f));
  if (unencodable.length) {
    notes.push(
      `The .str file is Windows-1252, which lacks ${unencodable
        .slice(0, 8)
        .map((char) => JSON.stringify(char))
        .join(' ')}${unencodable.length > 8 ? ' and more' : ''}; ${
        unencodable.length === 1 ? 'it was' : 'they were'
      } written as ?`,
    );
  }
  if (dropped) {
    notes.push(`${dropped} speech names or extra strings have no place in a .str file and were left out`);
  }
  return notes;
};

export const convertStringTables = async (
  extensionUri: vscode.Uri,
  archives: ArchiveModel,
  target?: unknown,
  selection?: unknown,
  values?: ConverterValues,
): Promise<void> => {
  const given = toUris(target, selection);
  const active = vscode.window.activeTextEditor?.document.uri;
  const files = await collectConverterFiles(
    given.length || !active ? given : [active],
    CONVERTER_FILE_TYPES.strings,
  );

  if (!files) {
    return;
  }

  const canWriteBeside = (uri: vscode.Uri) => !archives.isReadOnlyUri(uri);

  await openConverterDialog(
    extensionUri,
    {
      title: 'Convert String Tables',
      heading: 'Convert string tables',
      about: 'A .str becomes the .csf the game reads, and a .csf the .str you can edit, each beside its source or in a folder you choose.',
      files: files.accepted.map((uri) => ({ name: getFileName(uri), detail: `→ ${getOutputName(uri)}` })),
      skipped: files.skipped,
      fields: [OUTPUT_FIELD],
      values: { output: 'beside' },
      review: ({ output }) => {
        const review = createReview();
        const fallback = files.accepted.filter((uri) => !canWriteBeside(uri)).length;

        if (output === 'beside' && fallback) {
          review.notes.push(`${fallback} of the files are in the base game, so they go to a folder you choose.`);
        }
        return review;
      },
      convert: async ({ output }, run) => {
        const outputs = await resolveOutputUris(
          files.accepted,
          files.accepted.map(getOutputName),
          output,
          canWriteBeside,
        );

        if (!outputs) {
          return 'Nothing written';
        }

        let written = 0;

        for (const [at, source] of files.accepted.entries()) {
          if (run.isCancelled()) {
            break;
          }
          run.progress(`Converting ${getFileName(source)}`, at / files.accepted.length);
          try {
            const notes = await convertOne(source, outputs[at]);

            written++;
            run.log(`${getFileName(source)} → ${getFileName(outputs[at])}`);
            notes.forEach((note) => run.log(`${getFileName(source)}: ${note}`));
          } catch (error) {
            run.log(`${getFileName(source)}: ${error instanceof Error ? error.message : String(error)}`, true);
          }
        }
        return `${written} of ${files.accepted.length} converted`;
      },
    },
    values,
  );
};
