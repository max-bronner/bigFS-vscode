import { findHidingSources, getMeshVisibility } from '../../../formats/w3d/w3dScene';
import type { SceneMesh, SubObjectRule } from '../../../formats/w3d/w3dScene';
import { element } from '../element';
import { createPartSwitches } from './createPartSwitches';
import type { ViewerModel } from './describeModel';
import type { ViewChoices } from './createViewControls';

export interface PartsPanel {
  panel: HTMLDetailsElement;
  overrides: Map<number, boolean>;
  setModel(model: ViewerModel | undefined): void;
  refresh(keepsSwitches?: boolean): void;
  hold(): void;
}

const FILTERED_FROM = 12;

const listPartNames = (model: ViewerModel | undefined) =>
  model?.meshes.map((mesh) => `${mesh.container}.${mesh.name}`).join('\n');

export const createPartsPanel = (
  choices: ViewChoices,
  getRules: () => readonly SubObjectRule[],
  hint: string | undefined,
  onChange: () => void,
  onSwitch: (mesh: SceneMesh, on: boolean, othersShown: SceneMesh[]) => void,
): PartsPanel => {
  const panel = element('details', undefined, 'viewer-section viewer-parts');
  const summary = element('summary');
  const actions = element('div', undefined, 'viewer-part-actions');
  const all = element('button', 'Show all');
  const none = element('button', 'Hide all');
  const filter = element('input');
  const rows = element('div');
  const switches = createPartSwitches();
  const { overrides } = switches;
  let model: ViewerModel | undefined;

  all.id = 'partsAll';
  none.id = 'partsNone';
  filter.type = 'search';
  filter.placeholder = 'Filter parts';
  filter.className = 'viewer-filter';

  panel.hidden = true;
  panel.open = true;
  actions.append(all, none);
  panel.append(summary, ...(hint ? [element('p', hint)] : []), actions, filter, rows);

  const createGroupTitle = (text: string) => element('div', text, 'viewer-part-group');

  const refresh = (keepsSwitches = false) => {
    const meshes = model?.meshes ?? [];

    panel.hidden = !meshes.length;
    if (!model) {
      rows.replaceChildren();
      return;
    }

    const rules = getRules();
    const hiding = findHidingSources(meshes, rules, model.skeleton?.parents);

    switches.setHidden(hiding.map(Boolean), keepsSwitches);

    const focused = (document.activeElement as HTMLElement | null)?.dataset.part;
    const hiddenCount = hiding.filter(Boolean).length;
    const query = filter.value.trim().toLowerCase();
    const createRow = (at: number) => {
      const box = element('input');
      const label = element('label');
      const line = element('div', undefined, 'viewer-part');
      const isOn = overrides.get(at) ?? !hiding[at];

      box.type = 'checkbox';
      box.checked = isOn;
      box.dataset.part = String(at);
      box.onchange = () => {
        switches.switchPart(at, box.checked);
        summary.textContent = describeCount();
        onChange();
        onSwitch(
          meshes[at],
          box.checked,
          meshes.filter((_, other) => other !== at && (overrides.get(other) ?? !hiding[other])),
        );
      };
      label.append(box, ` ${meshes[at].name}`);
      line.append(label);
      if (hiding[at]) {
        line.append(element('div', `off by ${hiding[at]}`, 'viewer-part-reason'));
      }
      return line;
    };
    const describeCount = () =>
      `Parts: ${
        getMeshVisibility(model!, {
          lod: choices.lod,
          subObjectRules: [...rules],
          partOverrides: overrides,
        }).filter(Boolean).length
      } of ${meshes.length} drawn`;
    const matching = meshes
      .map((_, at) => at)
      .filter((at) => meshes[at].name.toLowerCase().includes(query));
    const shown = matching.filter((at) => !hiding[at]);
    const hidden = matching.filter((at) => !!hiding[at]);

    summary.textContent = describeCount();
    filter.hidden = meshes.length < FILTERED_FROM;
    rows.replaceChildren(
      ...(hiddenCount && shown.length ? [createGroupTitle('Drawn in the game')] : []),
      ...shown.map(createRow),
      ...(hidden.length ? [createGroupTitle('Hidden in the game')] : []),
      ...hidden.map(createRow),
    );
    if (focused !== undefined) {
      rows.querySelector<HTMLInputElement>(`input[data-part="${focused}"]`)?.focus();
    }
  };

  const switchAll = (on: boolean) => {
    model?.meshes.forEach((mesh, at) => {
      if (!on || !mesh.pickProxy) {
        switches.switchPart(at, on);
      }
    });
    refresh();
    onChange();
  };

  all.onclick = () => switchAll(true);
  none.onclick = () => switchAll(false);
  filter.oninput = () => refresh(true);

  return {
    panel,
    overrides,
    setModel: (shown) => {
      const names = listPartNames(shown);

      if (names !== listPartNames(model)) {
        filter.value = '';
      }
      switches.setModel(names);
      model = shown;
      refresh();
    },
    refresh,
    hold: switches.hold,
  };
};
