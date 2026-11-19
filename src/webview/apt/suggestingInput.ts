import { getVsCodeApi } from '../shared/vscodeApi';
import type {
  FixedSet,
  SuggestionKind,
  SuggestionRule,
} from '../../game/apt/suggestionKinds';
import type { FromPage, ToPage } from './protocol';

const vscode = getVsCodeApi<FromPage>();

const asked = new Set<SuggestionKind>();
const lists = new Map<string, HTMLDataListElement>();

const listFor = (id: string): HTMLDataListElement => {
  let list = lists.get(id);

  if (!list) {
    list = document.createElement('datalist');
    list.id = `suggest-${id}`;
    document.body.append(list);
    lists.set(id, list);
  }
  return list;
};

const fill = (
  list: HTMLDataListElement,
  options: readonly { value: string; label?: string }[],
): void =>
  list.replaceChildren(
    ...options.map(({ value, label }) => {
      const option = document.createElement('option');

      option.value = value;
      option.label = label ?? '';
      return option;
    }),
  );

const describe = (rule: SuggestionRule): string =>
  'fixed' in rule
    ? `Suggested values. ${rule.basis}.${rule.fixed.isPartial ? ' The list may be partial.' : ''}`
    : `Suggestions from the INI. ${rule.basis}`;

const fixedListFor = ({ id, options }: FixedSet): HTMLDataListElement => {
  const list = listFor(`fixed-${id}`);

  if (!list.childElementCount) {
    fill(list, options);
  }
  return list;
};

export const suggestFrom = (
  field: HTMLInputElement | HTMLTextAreaElement,
  rule: SuggestionRule,
): void => {
  if (!(field instanceof HTMLInputElement)) {
    return;
  }
  field.title = describe(rule);
  field.addEventListener('input', (event) => {
    if (!(event instanceof InputEvent) || event.inputType === 'insertReplacementText') {
      field.dispatchEvent(new Event('change'));
    }
  });
  if ('fixed' in rule) {
    field.setAttribute('list', fixedListFor(rule.fixed).id);
    return;
  }

  const { kind } = rule;

  field.setAttribute('list', listFor(kind).id);
  field.addEventListener('focus', () => {
    if (!asked.has(kind) && !listFor(kind).childElementCount) {
      asked.add(kind);
      vscode.postMessage({ kind: 'suggestions', field: kind });
    }
  });
};

export const suggestionsArrived = (
  data: Extract<ToPage, { kind: 'suggestions' }>,
): void => {
  asked.delete(data.field);
  fill(listFor(data.field), data.options);
};
