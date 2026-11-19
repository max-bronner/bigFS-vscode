import { matchFuzzy } from './matchFuzzy';

const NAME_MATCH_BONUS = 1000;

export const scoreFilePath = (
  query: string,
  name: string,
  filePath: string,
): number | undefined => {
  const wanted = query.replace(/\s+/g, '').replace(/\\/g, '/');

  if (!wanted) {
    return 0;
  }

  if (!wanted.includes('/')) {
    const byName = matchFuzzy(wanted, name);

    if (byName) {
      return NAME_MATCH_BONUS + byName.score;
    }
  }

  return matchFuzzy(wanted, filePath.replace(/\\/g, '/'))?.score;
};
