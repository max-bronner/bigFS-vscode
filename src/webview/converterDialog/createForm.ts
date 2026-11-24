import type { ConverterField, ConverterValues } from '../../core/converterDialog';
import { element } from '../shared/element';

export interface ConverterForm {
  element: HTMLElement;
  values: ConverterValues;
  setHidden(ids: readonly string[]): void;
  setDisabled(isDisabled: boolean): void;
}

const fillSelect = (select: HTMLSelectElement, field: Extract<ConverterField, { kind: 'select' }>) => {
  const groups = new Map<string, HTMLOptGroupElement>();

  for (const { value, label, group } of field.options) {
    const option = new Option(label, value);

    if (!group) {
      select.append(option);
      continue;
    }

    let parent = groups.get(group);

    if (!parent) {
      parent = element('optgroup');
      parent.label = group;
      groups.set(group, parent);
      select.append(parent);
    }
    parent.append(option);
  }
};

export const createForm = (
  fields: readonly ConverterField[],
  initial: ConverterValues,
  onChange: (values: ConverterValues) => void,
): ConverterForm => {
  const values: ConverterValues = { ...initial };
  const form = element('div', undefined, 'form');
  const rows = new Map<string, HTMLElement>();
  const controls: (HTMLInputElement | HTMLSelectElement)[] = [];

  for (const field of fields) {
    const id = `field-${field.id}`;
    const row = element('div', undefined, `field ${field.kind}`);
    const label = element('label', field.label);

    label.htmlFor = id;
    if (field.kind === 'checkbox') {
      const box = element('input');

      box.type = 'checkbox';
      box.id = id;
      box.checked = values[field.id] === true;
      box.onchange = () => {
        values[field.id] = box.checked;
        onChange({ ...values });
      };
      controls.push(box);
      row.append(box, label);
    } else if (field.kind === 'select') {
      const select = element('select');

      select.id = id;
      fillSelect(select, field);
      select.value = String(values[field.id]);
      select.onchange = () => {
        values[field.id] = select.value;
        onChange({ ...values });
      };
      controls.push(select);
      row.append(label, select);
    } else {
      const input = element('input');

      input.type = 'number';
      input.id = id;
      input.min = field.min === undefined ? '' : String(field.min);
      input.max = field.max === undefined ? '' : String(field.max);
      input.step = String(field.step ?? 1);
      input.value = String(values[field.id]);
      input.oninput = () => {
        values[field.id] = input.valueAsNumber;
        onChange({ ...values });
      };
      controls.push(input);
      const control = element('span', undefined, 'control');

      control.append(input, element('span', field.unit ?? '', 'unit'));
      row.append(label, control);
    }
    rows.set(field.id, row);
    form.append(row);
  }

  return {
    element: form,
    values,
    setHidden: (ids) => rows.forEach((row, fieldId) => (row.hidden = ids.includes(fieldId))),
    setDisabled: (isDisabled) => controls.forEach((control) => (control.disabled = isDisabled)),
  };
};
