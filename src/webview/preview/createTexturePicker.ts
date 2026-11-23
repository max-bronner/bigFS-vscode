import { getTextureStem } from '../../formats/w3d/w3dTextureSwaps';
import type { TextureLayers } from '../../formats/w3d/w3dTextureSwaps';
import type { TextureVariant } from '../../game/objects/objectAppearance';
import { element } from '../shared/element';
import { createSideRow } from './createSideRow';

export interface TexturePicker {
  list: HTMLElement;
  setList(variants: TextureVariant[]): void;
  showModel(file: string, textureNames: readonly string[]): void;
}

export interface TexturePickerEvents {
  onPick(layers: TextureLayers): void;
  onListed(count: number): void;
}

export const createTexturePicker = ({ onPick, onListed }: TexturePickerEvents): TexturePicker => {
  const list = element('div', undefined, 'side-list');
  let variants: TextureVariant[] = [];
  let shown: { file: string; names: Set<string> } | undefined;
  let picked = -1;

  list.id = 'modelTextures';
  list.title =
    'Textures the INI puts on this model: snow, damage and upgrade skins and random skins, each with an object that uses it';

  const render = () => {
    const changesShown = ({ model, layers }: TextureVariant) =>
      model === shown?.file &&
      layers.some((layer) =>
        layer.some(({ from }) => from === undefined || shown?.names.has(getTextureStem(from))),
      );
    const listed = variants.filter(changesShown);
    const rows = [
      { label: "The model's own", layers: [] as TextureLayers },
      ...listed,
    ].map(({ label, layers }, at) => {
      const row = createSideRow(label, undefined, () => {
        if (picked !== at - 1) {
          picked = at - 1;
          rows.forEach((each, other) => each.setAttribute('aria-pressed', String(other === at)));
          onPick(layers);
        }
      });

      row.setAttribute('aria-pressed', String(picked === at - 1));
      return row;
    });

    list.replaceChildren(...rows);
    onListed(listed.length);
  };

  return {
    list,
    setList: (next) => {
      variants = next;
      picked = -1;
      render();
    },
    showModel: (file, textureNames) => {
      shown = { file, names: new Set(textureNames.map(getTextureStem)) };
      picked = -1;
      render();
    },
  };
};
