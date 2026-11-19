import { element } from '../shared/element';
import type { ChoiceView, FromCahPage } from './protocol';

export const create = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  props?: Partial<HTMLElementTagNameMap[Tag]>,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[Tag] => {
  const node = Object.assign(document.createElement(tag), props ?? {});

  node.append(...children);
  return node;
};

export const createField = (
  value: string | number | undefined,
  readOnly: boolean,
  message: (value: string) => FromCahPage,
  post: (message: FromCahPage) => void,
  type = 'text',
): HTMLInputElement => {
  const input = create('input', {
    value: String(value ?? ''),
    type,
    disabled: readOnly,
  });

  input.addEventListener('change', () => post(message(input.value)));
  return input;
};

export const createChoiceSelect = (
  options: ChoiceView[],
  value: number,
  readOnly: boolean,
  message: (value: string) => FromCahPage,
  post: (message: FromCahPage) => void,
): HTMLSelectElement => {
  const select = create('select', { disabled: readOnly });

  if (!options.some((option) => option.index === value)) {
    select.append(
      create('option', {
        value: String(value),
        textContent: `${value} (not in the INI)`,
      }),
    );
  }
  options.forEach((option) =>
    select.append(
      create('option', {
        value: String(option.index),
        textContent: `${option.index}: ${option.label}`,
      }),
    ),
  );
  select.value = String(value);
  select.addEventListener('change', () => post(message(select.value)));
  return select;
};

export const createFormRow = (label: string, node: Node): Node[] => [
  element('div', label, 'muted'),
  node,
];
