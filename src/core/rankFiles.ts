import { scoreFilePath } from './scoreFilePath';

export interface RankableFile {
  name: string;
  path: string;
  key: string;
  isPreferred: boolean;
}

const RECENT_BONUS = 60;
const RECENT_DECAY = 2;
const RECENT_FLOOR = 10;

export const rankFiles = <T extends RankableFile>(
  query: string,
  files: readonly T[],
  recentKeys: readonly string[],
  limit: number,
): T[] => {
  if (!query.trim()) {
    const byKey = new Map(files.map((file) => [file.key, file]));

    return recentKeys.flatMap((key) => byKey.get(key) ?? []).slice(0, limit);
  }

  const recency = new Map(
    recentKeys.map((key, index) => [
      key,
      Math.max(RECENT_FLOOR, RECENT_BONUS - index * RECENT_DECAY),
    ]),
  );
  const scored: { file: T; score: number }[] = [];

  for (const file of files) {
    const score = scoreFilePath(query, file.name, file.path);

    if (score !== undefined) {
      scored.push({ file, score: score + (recency.get(file.key) ?? 0) });
    }
  }

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.file.isPreferred) - Number(a.file.isPreferred) ||
        a.file.path.length - b.file.path.length,
    )
    .slice(0, limit)
    .map(({ file }) => file);
};
