import type { NumericField } from '../../formats/particles/particleValueEdits';
import { $, post } from './page';
import type { SceneMessage } from './protocol';

const sliderSpan = (field: NumericField): [number, number, number] => {
  const key = field.keyword.toLowerCase();
  const value = field.value;

  if (/^color[1-8]$/.test(key) && field.part !== 'frame') {
    return [0, 255, 1];
  }
  if (/^alpha[1-8]$/.test(key) && field.part !== 'frame') {
    return [0, 1, 0.01];
  }
  if (/damping/.test(key)) {
    return [0, Math.max(1.2, value * 1.5), 0.001];
  }
  if (/angle/.test(key) && !/rate/.test(key)) {
    return [-6.2832, 6.2832, 0.01];
  }
  if (field.integer) {
    return [Math.min(0, value * 2), Math.max(10, Math.abs(value) * 3), 1];
  }

  const width = Math.max(1, Math.abs(value) * 3);

  return [value < 0 ? -width : Math.min(0, value - width), width, width / 500];
};

const createFieldRow = (field: NumericField, scene: SceneMessage): HTMLElement => {
  const row = document.createElement('div');
  const pending = scene.values[field.id];
  const current = pending ?? field.value;
  const label = document.createElement('label');
  const [min, max, step] = sliderSpan(field);
  const range = document.createElement('input');
  const number = document.createElement('input');
  const send = (raw: number) => {
    if (!Number.isFinite(raw)) {
      return;
    }

    const value = field.integer ? Math.round(raw) : raw;

    range.value = String(value);
    number.value = String(value);
    row.classList.add('changed');
    post({ kind: 'set', id: field.id, value });
  };

  row.className = 'field' + (pending !== undefined ? ' changed' : '');
  label.textContent = field.keyword + (field.part ? ' ' + field.part : '');
  label.title = `Line ${field.line + 1}, written ${field.value}. Click to show it in the file.`;
  label.onclick = () => post({ kind: 'reveal', line: field.line });
  range.type = 'range';
  range.min = String(Math.min(min, current));
  range.max = String(Math.max(max, current));
  range.step = String(step);
  range.value = String(current);
  range.dataset.id = field.id;
  number.type = 'number';
  number.step = String(step);
  number.value = String(current);
  number.dataset.id = field.id;
  range.oninput = () => send(Number(range.value));
  number.onchange = () => send(Number(number.value));
  row.append(label, range, number);
  return row;
};

export const renderFields = (scene: SceneMessage): void => {
  const container = $('fields');
  const pending = Object.keys(scene.values).length;
  const changed = pending > 0;
  const groups = new Map<string, NumericField[]>();

  $<HTMLButtonElement>('apply').disabled = !changed;
  $<HTMLButtonElement>('reset').disabled = !changed;
  $('apply').textContent = changed ? `Apply ${pending} to INI` : 'Apply to INI';
  $('pendingCount').textContent = changed
    ? `${pending} value${pending === 1 ? '' : 's'} changed, previewed only`
    : 'No change yet';
  for (const field of scene.fields) {
    const group = field.module || scene.root?.name || '';

    groups.set(group, [...(groups.get(group) ?? []), field]);
  }

  const active = (document.activeElement as HTMLElement | null)?.dataset?.id;

  if (active && container.querySelector(`[data-id="${CSS.escape(active)}"]`)) {
    for (const element of container.querySelectorAll<HTMLInputElement>(
      '[data-id]',
    )) {
      const value = scene.values[element.dataset.id!];
      const field = scene.fields.find((each) => each.id === element.dataset.id);

      if (!field || element === document.activeElement) {
        continue;
      }
      element.value = String(value ?? field.value);
      element
        .closest('.field')!
        .classList.toggle('changed', value !== undefined);
    }
    return;
  }
  container.replaceChildren(
    ...[...groups].flatMap(([group, fields]) => {
      const heading = document.createElement('h3');

      heading.textContent = group;
      return [heading, ...fields.map((field) => createFieldRow(field, scene))];
    }),
  );
};
