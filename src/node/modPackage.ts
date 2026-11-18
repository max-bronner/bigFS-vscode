import * as path from 'path';
import { archiveOrderKey } from '../game/install/gameView';

export type Delivery = 'gameFolder' | 'modFolder';

export interface BaseArchive {
  path: string;
  layer?: number;
  loose?: boolean;
  entries: ReadonlySet<string>;
}

export interface OverrideReport {
  added: string[];
  overrides: { path: string; over: string[] }[];
  ignored: { path: string; keptBy: string }[];
}

export const skippedFromPackage = (relativePath: string): boolean =>
  relativePath.split('/').some((segment) => segment.startsWith('.')) ||
  /\.big$/i.test(relativePath);

export const overrideReport = (
  files: string[],
  archiveName: string,
  base: BaseArchive[],
  delivery: Delivery,
): OverrideReport => {
  const report: OverrideReport = { added: [], overrides: [], ignored: [] };
  const mine = archiveOrderKey(archiveName);
  const ordered = [...base].sort(
    (a, b) =>
      (a.layer ?? 0) - (b.layer ?? 0) ||
      Number(!!b.loose) - Number(!!a.loose) ||
      (archiveOrderKey(a.path) < archiveOrderKey(b.path) ? -1 : 1),
  );

  for (const file of files) {
    const key = file.replace(/\\/g, '/').toLowerCase();
    const holders = ordered.filter((archive) => archive.entries.has(key));

    if (!holders.length) {
      report.added.push(file);
      continue;
    }

    const first = holders[0];

    if (
      delivery === 'gameFolder' &&
      (first.layer ?? 0) === 0 &&
      (first.loose || archiveOrderKey(first.path) < mine)
    ) {
      report.ignored.push({ path: file, keptBy: first.path });
    } else {
      report.overrides.push({
        path: file,
        over: holders.map((archive) => archive.path),
      });
    }
  }
  return report;
};

export const defaultPackageFolder = (
  modFolder: string,
  bases: readonly string[],
  home: string,
): string => {
  const beside = path.dirname(modFolder);

  return bases.some((base) => isInsideOrSame(beside, base)) ? home : beside;
};

export const isInsideOrSame = (candidate: string, folder: string): boolean => {
  const relative = path.relative(
    path.resolve(folder).toLowerCase(),
    path.resolve(candidate).toLowerCase(),
  );

  return (
    relative === '' ||
    (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative))
  );
};

export const reportMarkdown = (
  report: OverrideReport,
  archiveName: string,
  delivery: Delivery,
  problems: { path: string; line: number; message: string }[],
  baseKnown: boolean,
): string => {
  const list = (lines: string[]) =>
    lines.length ? lines.map((line) => `- ${line}`).join('\n') : '_none_';
  const total =
    report.added.length + report.overrides.length + report.ignored.length;

  return [
    `# Packaging ${archiveName}`,
    '',
    delivery === 'gameFolder'
      ? `Copied into the game folder, it loads by its name: it beats a base archive whose path sorts after \`${archiveName}\`, and loses to one that sorts before.`
      : 'Loaded with `-mod`, it is a layer before the game and wins over every base archive.',
    '',
    `${total} files: ${report.overrides.length} override the game, ${report.added.length} are new, ${report.ignored.length} would be ignored.`,
    ...(baseKnown
      ? []
      : [
          '',
          '> No base game folder is set (`bigfs.baseGameFolder`), so every file counts as new.',
        ]),
    '',
    `## Ignored: a base archive loads first (${report.ignored.length})`,
    '',
    list(
      report.ignored.map(
        ({ path, keptBy }) =>
          `\`${path}\`: kept by \`${keptBy}\`; rename the archive to sort before it, or load the mod with \`-mod\``,
      ),
    ),
    '',
    `## INI errors (${problems.length})`,
    '',
    list(
      problems.map(
        ({ path, line, message }) => `\`${path}:${line + 1}\`: ${message}`,
      ),
    ),
    '',
    `## Overrides (${report.overrides.length})`,
    '',
    list(
      report.overrides.map(
        ({ path, over }) =>
          `\`${path}\` over ${over.map((each) => `\`${each}\``).join(', ')}`,
      ),
    ),
    '',
    `## New (${report.added.length})`,
    '',
    list(report.added.map((path) => `\`${path}\``)),
    '',
  ].join('\n');
};
