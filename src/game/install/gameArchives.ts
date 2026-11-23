import type { InstallKind } from './installLayers';

const ROOT_ARCHIVES = new Set([
  'ambientstreams.big',
  'audio.big',
  'bases.big',
  'data1.big',
  'data2.big',
  'ini.big',
  'libraries.big',
  'lotrsec.big',
  'maps.big',
  'music.big',
  'shaders.big',
  'terrain.big',
  'textures0.big',
  'textures1.big',
  'textures2.big',
  'textures3.big',
  'textures4.big',
  'w3d.big',
  'window.big',
]);

const GAME_FOLDERS = ['apt/', 'lang/'];

export const isGameArchive = (kind: InstallKind, pathInSource: string): boolean => {
  if (kind === 'mod') {
    return false;
  }

  const path = pathInSource.toLowerCase();

  return (
    ROOT_ARCHIVES.has(path) ||
    GAME_FOLDERS.some(
      (folder) => path.startsWith(folder) && !path.slice(folder.length).includes('/'),
    )
  );
};
