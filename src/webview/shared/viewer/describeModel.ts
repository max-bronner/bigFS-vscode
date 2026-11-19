import type { ModelScene } from '../../../formats/w3d/w3dScene';

export interface ViewerModel extends ModelScene {
  shownOn?: string;
}

export const describeModel = ({
  shownOn,
  meshes,
  hierarchy,
  skeleton,
  missing,
}: ViewerModel): string =>
  [
    ...(shownOn ? [`shown on ${shownOn}, the model drawn on its skeleton`] : []),
    `${meshes.length} meshes`,
    `${meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0)} triangles`,
    ...(hierarchy && skeleton
      ? [`skeleton ${hierarchy} (${skeleton.parents.length} bones)`]
      : []),
    ...(missing.length ? [`textures not found: ${missing.join(', ')}`] : []),
  ].join(' · ');

export const describeDetailLevels = ({ hlod }: ViewerModel): string => {
  if (!hlod?.lods.length) {
    return '';
  }

  const { lods, skippedLodCount, aggregates, proxies } = hlod;

  return [
    `${lods.length} level${lods.length === 1 ? '' : 's'} of detail`,
    ...(skippedLodCount
      ? [
          `${skippedLodCount} more LOD array${skippedLodCount === 1 ? '' : 's'} in the file past the header's count, which the game does not read`,
        ]
      : []),
    `aggregates: ${aggregates.join(', ') || 'none'}`,
    `proxies: ${proxies.join(', ') || 'none'}`,
  ].join(' · ');
};
