import { stripComment, tokenize } from '../../formats/ini/sageIniParser';
import type { SageDocument } from '../../formats/ini/sageIniParser';

const LABEL = /^[A-Z][A-Z0-9_]{2,}:[A-Za-z_][\w.-]*$/;

export interface LabelToken {
  text: string;
  line: number;
  start: number;
  end: number;
}

export const findGameTextLabels = (parsed: SageDocument): LabelToken[] =>
  parsed.statements.flatMap((statement) =>
    statement.kind === 'field'
      ? statement.values
          .filter((value) => LABEL.test(value.text))
          .map((value) => ({
            text: value.text,
            line: statement.line,
            start: value.start,
            end: value.end,
          }))
      : [],
  );

export const labelsInText = (text: string): string[] =>
  text.split(/\r?\n/).flatMap((line) =>
    tokenize(stripComment(line))
      .slice(1)
      .map((token) => token.text)
      .filter((word) => LABEL.test(word)),
  );

export const missingTextMessage = (label: string): string =>
  `No game text for '${label}' in any string table`;

export const labelOfMissingText = (message: string): string | undefined =>
  /^No game text for '(.+)' in any string table$/.exec(message)?.[1];

export const placeholderText = (label: string): string =>
  label
    .slice(label.indexOf(':') + 1)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim();
