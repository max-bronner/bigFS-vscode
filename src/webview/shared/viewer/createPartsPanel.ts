import { findHidingSources, getMeshVisibility } from '../../../formats/w3d/w3dScene';
import type { SubObjectRule } from '../../../formats/w3d/w3dScene';
import { element } from '../element';
import type { ViewerModel } from './describeModel';
import type { ViewChoices } from './createViewControls';

export interface PartsPanel {
  panel: HTMLDetailsElement;
  overrides: Map<number, boolean>;
  setModel(model: ViewerModel | undefined): void;
  refresh(): void;
}

export const createPartsPanel = (
  choices: ViewChoices,
  getRules: () => readonly SubObjectRule[],
  hint: string | undefined,
  onChange: () => void,
): PartsPanel => {
  const panel = element('details', undefined, 'viewer-parts');
  const summary = element('summary');
  const rows = element('div');
  const overrides = new Map<number, boolean>();
  let model: ViewerModel | undefined;

  panel.hidden = true;
  panel.append(summary, ...(hint ? [element('p', hint)] : []), rows);

  const refresh = () => {
    const meshes = model?.meshes ?? [];

    panel.hidden = !meshes.length;
    if (!model) {
      rows.replaceChildren();
      return;
    }

    const rules = getRules();
    const hiding = findHidingSources(meshes, rules, model.skeleton?.parents);
    const hiddenCount = meshes.filter((mesh) => mesh.hidden).length;
    const drawn = getMeshVisibility(model, {
      lod: choices.lod,
      showHidden: choices.showHidden,
      subObjectRules: [...rules],
      partOverrides: overrides,
    }).filter(Boolean).length;

    summary.textContent = [
      `Parts: ${drawn} of ${meshes.length} drawn`,
      ...(hiddenCount && !choices.showHidden
        ? [`${hiddenCount} off by the W3D HIDDEN flag`]
        : []),
    ].join(' · ');
    rows.replaceChildren(
      ...meshes.map((mesh, at) => {
        const box = element('input');
        const label = element('label');
        const line = element('div');

        box.type = 'checkbox';
        box.checked = overrides.get(at) ?? (choices.showHidden || !hiding[at]);
        box.onchange = () => {
          overrides.set(at, box.checked);
          refresh();
          onChange();
        };
        label.append(box, ` ${mesh.name}${hiding[at] ? ` (off by ${hiding[at]})` : ''}`);
        line.append(label);
        return line;
      }),
    );
  };

  return {
    panel,
    overrides,
    setModel: (shown) => {
      model = shown;
      overrides.clear();
      refresh();
    },
    refresh,
  };
};
