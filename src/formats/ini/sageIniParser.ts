import {
  FRAGMENT_CONTEXT,
  ROOT_CONTEXT,
  UNCHECKED_CONTEXT,
} from './sageIniSchema';
import { scanCalls } from './sageIniPreprocessor';
import type { SageCall } from './sageIniPreprocessor';
import type { SageIniSchema } from './sageIniSchema';

export interface SageToken {
  text: string;
  start: number;
  end: number;
}

export interface SageBlock {
  keyword: string;
  name?: string;
  moduleType?: string;
  moduleTag?: string;
  context: string;
  isLegacy?: boolean;
  startLine: number;
  endLine: number;
  isClosed: boolean;
  children: SageBlock[];
}

export interface SageStatement {
  line: number;
  keyword: SageToken;
  values: SageToken[];
  context: string;
  kind: 'block' | 'field';
  isKnown: boolean;
  block?: SageBlock;
}

export interface SageInclude {
  line: number;
  start: number;
  end: number;
  path: string;
}

export interface SageMacroDefinition {
  line: number;
  start: number;
  end: number;
  name: string;
  value: string;
  valueStart: number;
}

export interface SageScript {
  startLine: number;
  endLine: number;
}

export interface SageDocument {
  fileContext: string;
  blocks: SageBlock[];
  statements: SageStatement[];
  strayEnds: number[];
  calls: SageCall[];
  includes: SageInclude[];
  macros: SageMacroDefinition[];
  scripts: SageScript[];
}

const END_PATTERN = /^end$/i;
const BEGIN_SCRIPT_PATTERN = /^\s*BeginScript\s*$/i;
const END_SCRIPT_PATTERN = /^\s*EndScript\s*$/i;
const TOKEN_PATTERN = /"([^"=]*)"?|[^\s="]+/g;
const INCLUDE_PATTERN = /^\s*#include\s+"([^"]*)"/i;
const MACRO_PATTERN = /^\s*#define\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/i;

export const stripComment = (line: string): string => {
  const semicolon = line.indexOf(';');
  const slashes = line.indexOf('//');
  const markers = [semicolon, slashes].filter((at) => at >= 0);

  return markers.length ? line.slice(0, Math.min(...markers)) : line;
};

export const tokenize = (content: string): SageToken[] => {
  const tokens: SageToken[] = [];

  TOKEN_PATTERN.lastIndex = 0;

  for (
    let match = TOKEN_PATTERN.exec(content);
    match;
    match = TOKEN_PATTERN.exec(content)
  ) {
    const [whole, quoted] = match;
    const text = quoted ?? whole;
    const start = quoted === undefined ? match.index : match.index + 1;

    tokens.push({ text, start, end: start + text.length });
  }

  return tokens;
};

const indentOf = (line: string): number =>
  line.length - line.trimStart().length;

const opensBlockByIndent = (lines: string[], index: number): boolean => {
  const indent = indentOf(lines[index]);

  for (let next = index + 1; next < lines.length; next += 1) {
    const content = stripComment(lines[next]);

    if (!content.trim()) {
      continue;
    }

    if (indentOf(lines[next]) > indent) {
      continue;
    }

    return END_PATTERN.test(content.trim()) && indentOf(lines[next]) === indent;
  }

  return false;
};

const opensInlineDefinition = (
  keyword: SageToken,
  values: readonly SageToken[],
): boolean =>
  keyword.text === 'AddEmotion' && values[0]?.text.toUpperCase() === 'OVERRIDE';

export const parseSageIni = (
  lines: string[],
  schema: SageIniSchema,
  { isFragment = false }: { isFragment?: boolean } = {},
): SageDocument => {
  const fileContext = isFragment ? FRAGMENT_CONTEXT : ROOT_CONTEXT;
  const blocks: SageBlock[] = [];
  const statements: SageStatement[] = [];
  const strayEnds: number[] = [];
  const calls: SageCall[] = [];
  const includes: SageInclude[] = [];
  const macros: SageMacroDefinition[] = [];
  const scripts: SageScript[] = [];
  const open: SageBlock[] = [];

  let scriptStart = -1;

  lines.forEach((line, index) => {
    if (scriptStart >= 0) {
      if (END_SCRIPT_PATTERN.test(stripComment(line))) {
        scripts.push({ startLine: scriptStart, endLine: index });
        scriptStart = -1;
      }

      return;
    }

    if (BEGIN_SCRIPT_PATTERN.test(stripComment(line))) {
      scriptStart = index;
      return;
    }

    const content = stripComment(line);
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith('#')) {
      const include = INCLUDE_PATTERN.exec(content);

      if (include) {
        const start = content.indexOf(include[1]);

        includes.push({
          line: index,
          start,
          end: start + include[1].length,
          path: include[1],
        });
      }

      const macro = MACRO_PATTERN.exec(content);

      if (macro) {
        const start = content.indexOf(macro[1]);
        const value = macro[2].trim();

        macros.push({
          line: index,
          start,
          end: start + macro[1].length,
          name: macro[1],
          value,
          valueStart: value
            ? content.indexOf(value, start + macro[1].length)
            : content.length,
        });
      }

      return;
    }

    const [keyword, ...values] = tokenize(content);

    if (!keyword) {
      return;
    }

    if (content.includes('#')) {
      calls.push(...scanCalls(content, index));
    }

    if (END_PATTERN.test(keyword.text)) {
      const closing = open.pop();

      if (closing) {
        closing.endLine = index;
        closing.isClosed = true;
      } else {
        strayEnds.push(index);
      }

      return;
    }

    const context = open.length ? open[open.length - 1].context : fileContext;
    const resolution = opensInlineDefinition(keyword, values)
      ? { kind: 'block' as const, childContext: UNCHECKED_CONTEXT }
      : schema.resolve(
          context,
          keyword.text,
          values.map((token) => token.text),
        );
    const isKnown = resolution !== undefined || !schema.isChecked(context);

    const kind =
      resolution?.kind ??
      (opensBlockByIndent(lines, index) ? 'block' : 'field');

    const statement: SageStatement = {
      line: index,
      keyword,
      values,
      context,
      kind,
      isKnown,
    };

    statements.push(statement);

    if (kind !== 'block') {
      return;
    }

    const moduleType = resolution?.moduleType;

    const block: SageBlock = {
      keyword: keyword.text,
      name: values.length
        ? values.map((token) => token.text).join(' ')
        : undefined,
      moduleType,
      moduleTag: moduleType === undefined ? undefined : values[1]?.text,
      context: resolution?.childContext ?? UNCHECKED_CONTEXT,
      isLegacy: resolution?.isLegacy,
      startLine: index,
      endLine: index,
      isClosed: false,
      children: [],
    };

    statement.block = block;

    const parent = open[open.length - 1];

    if (parent) {
      parent.children.push(block);
    } else {
      blocks.push(block);
    }

    open.push(block);
  });

  const lastLine = Math.max(lines.length - 1, 0);

  open.forEach((block) => {
    block.endLine = lastLine;
  });

  if (scriptStart >= 0) {
    scripts.push({ startLine: scriptStart, endLine: lastLine });
  }

  return {
    fileContext,
    blocks,
    statements,
    strayEnds,
    calls,
    includes,
    macros,
    scripts,
  };
};

export const forEachBlock = (
  blocks: readonly SageBlock[],
  visit: (block: SageBlock) => void,
): void => {
  blocks.forEach((block) => {
    visit(block);
    forEachBlock(block.children, visit);
  });
};

export const isFragmentPath = (entryPath: string): boolean =>
  !entryPath.toLowerCase().endsWith('.ini');
