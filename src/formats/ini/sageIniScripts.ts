import { parse } from 'luaparse';

export interface ScriptProblem {
  line: number;
  column: number;
  message: string;
}

export const findScriptProblems = (
  lines: string[],
  regions: { startLine: number; endLine: number }[],
): ScriptProblem[] =>
  regions.flatMap(({ startLine, endLine }) => {
    const body = lines.slice(startLine + 1, endLine).join('\n');

    try {
      parse(body, { luaVersion: '5.1', comments: false, locations: false });

      return [];
    } catch (error) {
      if (error instanceof RangeError) {
        return [
          {
            line: startLine,
            column: 0,
            message: 'Lua: the script is nested too deeply to check',
          },
        ];
      }

      const failure = error as {
        line?: number;
        column?: number;
        message?: string;
      };

      if (typeof failure.line !== 'number') {
        return [];
      }

      return [
        {
          line: startLine + failure.line,
          column: failure.column ?? 0,
          message: `Lua: ${(failure.message ?? 'syntax error').replace(/^\[\d+:\d+\]\s*/, '')}`,
        },
      ];
    }
  });
