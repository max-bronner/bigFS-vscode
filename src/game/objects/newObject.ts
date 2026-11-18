import { duplicateDefinition, renameLabels } from './duplicateDefinition';
import type { LabelRename } from './duplicateDefinition';
import { stripComment, tokenize } from '../../formats/ini/sageIniParser';

export type NewObjectMode = 'inherit' | 'copy';

export interface PlannedBlock {
  lines: string[];
  labels: LabelRename[];
}

export const displayLabel = (name: string) => `OBJECT:${name}`;

export const setField = (
  lines: string[],
  keyword: string,
  value: string,
): string[] => {
  const first = lines.slice(1, -1).find((line) => line.trim() !== '');
  const own = (first && /^\s*/.exec(first)![0]) || '  ';
  const at = lines.findIndex(
    (line, index) =>
      index > 0 &&
      line.startsWith(own) &&
      !/^\s/.test(line.slice(own.length)) &&
      tokenize(stripComment(line))[0]?.text.toLowerCase() ===
        keyword.toLowerCase(),
  );
  const written = `${own}${keyword} = ${value}`;

  return at >= 0
    ? lines.map((line, index) => (index === at ? written : line))
    : [lines[0], written, ...lines.slice(1)];
};

export const inheritingObject = (
  name: string,
  parent: string,
): PlannedBlock => ({
  lines: [
    `ChildObject ${name} ${parent}`,
    `  DisplayName = ${displayLabel(name)}`,
    `  ; Write what differs from ${parent} here: a field replaces the`,
    '  ; inherited one, a module replaces the one with its tag',
    'End',
  ],
  labels: [],
});

export const copiedObject = (
  lines: string[],
  startLine: number,
  endLine: number,
  name: string,
): PlannedBlock => {
  const copy = duplicateDefinition(lines, startLine, endLine, name);

  return {
    lines: setField(copy.lines, 'DisplayName', displayLabel(name)),
    labels: copy.labels,
  };
};

export const buttonName = (
  button: string,
  source: string,
  name: string,
): string => {
  const at = button.toLowerCase().indexOf(source.toLowerCase());

  return at >= 0
    ? button.slice(0, at) + name + button.slice(at + source.length)
    : `${button}_${name}`;
};

export const copiedButton = (
  lines: string[],
  startLine: number,
  endLine: number,
  newButton: string,
  name: string,
): PlannedBlock => {
  const copy = duplicateDefinition(lines, startLine, endLine, newButton);
  const source = tokenize(stripComment(lines[startLine]))[1]?.text ?? '';
  const objectLine = copy.lines.find(
    (line) => tokenize(stripComment(line))[0]?.text.toLowerCase() === 'object',
  );
  const builds = objectLine
    ? tokenize(stripComment(objectLine))[1]?.text
    : undefined;
  const relabelled =
    builds && builds !== source
      ? renameLabels(copy.lines.slice(1), builds, name)
      : { lines: copy.lines.slice(1), labels: [] };

  return {
    lines: setField([copy.lines[0], ...relabelled.lines], 'Object', name),
    labels: [...copy.labels, ...relabelled.labels],
  };
};

export const slotLine = (
  setLines: string[],
  button: string,
): { line: number; text: string } => {
  let highest = 0;
  let indent = '  ';

  for (const line of setLines.slice(1, -1)) {
    const [slot] = tokenize(stripComment(line));

    if (slot && /^\d+$/.test(slot.text)) {
      highest = Math.max(highest, Number(slot.text));
      indent = /^\s*/.exec(line)![0];
    }
  }
  return {
    line: setLines.length - 1,
    text: `${indent}${highest + 1} = ${button}`,
  };
};

export const OBJECT_FOLDER = 'data/ini/object';

export const isLoadedObjectPath = (entryPath: string): boolean =>
  /^data\/ini\/object\/(?:.+\/)?[^/]+\.ini$/i.test(
    entryPath.replace(/\\/g, '/'),
  );

export const newObjectEntryPath = (
  sourceEntryPath: string | undefined,
  name: string,
): string =>
  sourceEntryPath && isLoadedObjectPath(sourceEntryPath)
    ? sourceEntryPath.replace(/\\/g, '/')
    : `${OBJECT_FOLDER}/${name}.ini`;
