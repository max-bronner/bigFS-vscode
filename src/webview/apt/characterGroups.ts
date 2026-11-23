import type { AptMovie, Character } from '../../formats/apt/aptMovie';
import { TYPE_NAMES } from './describeCharacter';

export const CHARACTER_KINDS = [
  'exports',
  'imports',
  'sprites',
  'buttons',
  'shapes',
  'text',
  'images',
  'other',
] as const;

export type CharacterKind = (typeof CHARACTER_KINDS)[number];

export const KIND_TITLES: Record<CharacterKind, string> = {
  exports: 'Exports',
  imports: 'Imports',
  sprites: 'Sprites',
  buttons: 'Buttons',
  shapes: 'Shapes',
  text: 'Text',
  images: 'Images',
  other: 'Other',
};

export interface CharacterRow {
  id: number;
  kind: CharacterKind;
  name: string;
  detail: string;
}

const KIND_OF_TYPE: Record<Character['type'], CharacterKind> = {
  movie: 'exports',
  placeholder: 'imports',
  sprite: 'sprites',
  button: 'buttons',
  shape: 'shapes',
  morph: 'shapes',
  editText: 'text',
  text: 'text',
  font: 'text',
  image: 'images',
  unknown: 'other',
};

export const listCharacterRows = (
  source: Pick<AptMovie, 'characters' | 'imports' | 'exports'> & { name?: string },
  isResolved: (id: number) => boolean,
): CharacterRow[] =>
  source.characters.map((character) => {
    const { id } = character;
    const type = TYPE_NAMES[character.type].toLowerCase();
    const exported = source.exports
      .filter((each) => each.character === id)
      .map((each) => each.name);

    if (character.type === 'movie') {
      return { id, kind: 'exports', name: source.name ?? 'Movie', detail: 'movie' };
    }
    if (exported.length) {
      return { id, kind: 'exports', name: exported.join(', '), detail: type };
    }
    if (character.type === 'placeholder') {
      const imported = source.imports.find((each) => each.character === id);

      return {
        id,
        kind: 'imports',
        name: imported?.name ?? 'Import',
        detail: !isResolved(id)
          ? `${imported?.movie ?? ''} (unresolved)`.trimStart()
          : (imported?.movie ?? ''),
      };
    }
    if (character.type === 'editText') {
      return {
        id,
        kind: 'text',
        name: character.variable || character.text || 'EditText',
        detail: 'edit text',
      };
    }
    if (character.type === 'font') {
      return { id, kind: 'text', name: character.name || 'Font', detail: 'font' };
    }
    return {
      id,
      kind: KIND_OF_TYPE[character.type],
      name: TYPE_NAMES[character.type],
      detail:
        character.type === 'sprite'
          ? `${character.frameCount} frame${character.frameCount === 1 ? '' : 's'}`
          : '',
    };
  });

export const matchesFilter = (row: CharacterRow, needle: string): boolean =>
  !needle ||
  `#${row.id} ${row.name} ${row.detail} ${KIND_TITLES[row.kind]} ${row.detail}:${row.name}`
    .toLowerCase()
    .includes(needle.toLowerCase());
