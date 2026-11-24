import type { FileVersion, VersionCandidate, VersionLayer } from './listFileVersions';

export interface VersionDescription {
  label: string;
  description: string;
  detail: string;
}

export interface VersionFacts {
  isRetailOriginal?: boolean;
  size?: number;
  modified?: Date;
}

const getGameName = ({ kind, base }: VersionLayer): string =>
  kind === 'rotwk' ? 'ROTWK' : kind === 'bfme2' ? 'BFME II' : base ? 'base game' : 'mod';

const getContainer = ({ archive, layer }: Pick<VersionCandidate<unknown>, 'archive' | 'layer'>): string =>
  archive ?? `${layer.label} folder`;

const toOrdinal = (place: number): string => {
  const suffix =
    place % 100 >= 11 && place % 100 <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th');

  return `${place}${suffix}`;
};

const formatSize = (size: number): string =>
  size < 1024
    ? `${size} bytes`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;

const describePlace = ({ place, stack, isOtherStack }: FileVersion<unknown>): string => {
  if (!isOtherStack) {
    return place === 1 ? 'wins' : `${toOrdinal(place)} in load order`;
  }

  const stackName = stack.kind === 'mod' ? stack.label : getGameName(stack);

  return place === 1 ? `wins in ${stackName}` : `${toOrdinal(place)} in ${stackName}`;
};

export const describeFileVersion = (
  version: FileVersion<unknown>,
  facts: VersionFacts = {},
): VersionDescription => ({
  label: getContainer(version),
  description: [
    getGameName(version.layer),
    describePlace(version),
    ...(facts.isRetailOriginal ? ['retail original'] : []),
  ].join(' · '),
  detail: [
    version.layer.label,
    ...(facts.size === undefined ? [] : [formatSize(facts.size)]),
    ...(facts.modified ? [facts.modified.toLocaleString()] : []),
  ].join(' · '),
});

export const getSideTitle = (
  fileName: string,
  side: Pick<VersionCandidate<unknown>, 'archive' | 'layer'>,
): string => `${fileName} (${getContainer(side)} · ${getGameName(side.layer)})`;
