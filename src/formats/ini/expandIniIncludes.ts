const MAX_DEPTH = 4;

const MAX_LINES = 200_000;

const INCLUDE_PATTERN = /^\s*#include\s+"([^"]*)"/i;

export const expandIniIncludes = async (
  lines: readonly string[],
  readInclude: (path: string) => Promise<string[] | undefined>,
): Promise<string[]> => {
  const expanded: string[] = [];
  const expand = async (source: readonly string[], depth: number) => {
    for (const line of source) {
      const path = INCLUDE_PATTERN.exec(line)?.[1];
      const included =
        path && depth < MAX_DEPTH ? await readInclude(path) : undefined;

      if (included) {
        await expand(included, depth + 1);
      } else if (expanded.length < MAX_LINES) {
        expanded.push(line);
      }
      if (expanded.length >= MAX_LINES) {
        return;
      }
    }
  };

  await expand(lines, 0);
  return expanded;
};
