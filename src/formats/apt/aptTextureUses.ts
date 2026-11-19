import { getRunTextureBox, getTexturePath } from './aptGeometry';
import type { DatLocation, RuRun, TextureBox } from './aptGeometry';
import type { Character } from './aptMovie';

export interface AptTextureName {
  movie: string;
  id: number;
}

export interface RunSample {
  run: number;
  image: number;
  texture?: string;
  box: TextureBox;
}

export const parseAptTextureName = (
  fileName: string,
): AptTextureName | undefined => {
  const match = /^apt_(.+)_(\d+)\.(?:tga|dds)$/i.exec(
    fileName.slice(fileName.search(/[^\\/]*$/)),
  );

  return match ? { movie: match[1].toLowerCase(), id: Number(match[2]) } : undefined;
};

export const getImageTextures = (
  movie: string,
  characters: readonly Character[],
  dat: ReadonlyMap<number, DatLocation>,
): Map<number, string> => {
  const paths = new Map<number, string>();

  for (const character of characters) {
    const location =
      character.type === 'image' ? dat.get(character.texture) : undefined;

    if (character.type === 'image' && location) {
      paths.set(character.id, getTexturePath(movie, character.texture, location));
    }
  }
  return paths;
};

export const getRunSamples = (
  runs: readonly RuRun[],
  imageTextures: ReadonlyMap<number, string>,
): RunSample[] =>
  runs.flatMap((run, index) => {
    const box = getRunTextureBox(run);

    return run.style.kind === 'texture' && box
      ? [
          {
            run: index,
            image: run.style.character,
            texture: imageTextures.get(run.style.character),
            box,
          },
        ]
      : [];
  });

export const isSameTexture = (path: string, fileName: string): boolean => {
  const stem = (name: string) =>
    name
      .slice(name.search(/[^\\/]*$/))
      .replace(/\.[^.]*$/, '')
      .toLowerCase();

  return stem(path) === stem(fileName);
};
