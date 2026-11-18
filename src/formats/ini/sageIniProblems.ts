import {
  FRAGMENT_CONTEXT,
  ROOT_CONTEXT,
  UNCHECKED_CONTEXT,
} from './sageIniSchema';
import type { SageIniSchema } from './sageIniSchema';
import { forEachBlock } from './sageIniParser';
import type { SageDocument } from './sageIniParser';

export interface SageProblem {
  line: number;
  start: number;
  end?: number;
  message: string;
  severity: 'error' | 'warning' | 'hint';
}

const GAME_NAMES = {
  rotwk: 'Rise of the Witch-king',
  bfme2: 'BFME II',
  bfme1: 'BFME',
};

export const findSageIniProblems = (
  parsed: SageDocument,
  schema: SageIniSchema,
): SageProblem[] => {
  const problems: SageProblem[] = [];
  const game = GAME_NAMES[schema.game];

  for (const {
    isKnown,
    keyword,
    values,
    context,
    line,
    block,
  } of parsed.statements) {
    if (!schema.isStrict) {
      break;
    }

    if (
      block?.moduleType !== undefined &&
      block.context === UNCHECKED_CONTEXT
    ) {
      problems.push({
        line,
        start: values[0].start,
        end: values[0].end,
        message: `'${block.moduleType}' is not a module ${game} registers`,
        severity: 'warning',
      });
    }

    if (isKnown) {
      continue;
    }

    const where =
      context === ROOT_CONTEXT || context === FRAGMENT_CONTEXT
        ? 'at file scope'
        : `in ${schema.describeContext(context)}`;

    problems.push({
      line,
      start: keyword.start,
      end: keyword.end,
      message: `'${keyword.text}' is not a block or field ${game} reads ${where}`,
      severity: 'warning',
    });
  }

  if (schema.isStrict) {
    for (const { block, keyword, line } of parsed.statements) {
      if (block?.isLegacy) {
        problems.push({
          line,
          start: keyword.start,
          end: keyword.end,
          message: `'${block.keyword}' at file scope is a format ${game} does not read, so this block has no effect in game`,
          severity: 'hint',
        });
      }
    }
  }

  for (const call of parsed.calls) {
    if (call.error) {
      problems.push({
        line: call.line,
        start: call.start,
        end: call.end,
        message: call.error,
        severity: 'error',
      });
    }
  }

  if (parsed.fileContext === FRAGMENT_CONTEXT) {
    return problems;
  }

  const headers = new Map(
    parsed.statements.flatMap((statement) =>
      statement.block ? [[statement.block, statement.keyword] as const] : [],
    ),
  );

  forEachBlock(parsed.blocks, (block) => {
    if (block.isClosed) {
      return;
    }

    const header = headers.get(block);

    problems.push({
      line: block.startLine,
      start: header?.start ?? 0,
      end: header?.end,
      message: `'${block.keyword}' is never closed with End`,
      severity: 'error',
    });
  });

  for (const line of parsed.strayEnds) {
    problems.push({
      line,
      start: 0,
      message: 'End with no block open to close',
      severity: 'error',
    });
  }

  return problems;
};
