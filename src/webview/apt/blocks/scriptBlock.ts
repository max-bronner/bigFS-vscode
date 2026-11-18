import type { AptEdit } from '../../../formats/apt/writer/aptEdit';
import type { FromPage, ToPage } from '../protocol';
import { send } from '../details';
import { getVsCodeApi } from '../../shared/vscodeApi';
import { state } from '../state';
import { blockCard } from './blockCard';
import { action, field } from './controls';
import { scriptField } from './scriptField';

const vscode = getVsCodeApi<FromPage>();

export interface ScriptSite {
  label: string;
  block: number;
  tab: string;
  remove?: AptEdit;
  when?: () => HTMLElement;
  whenLabel?: string;
  onMove?: (by: -1 | 1) => void;
  open?: boolean;
}

const host = (block: number): Element | null =>
  document.querySelector(`#details [data-script-block="${block}"]`);

export const scriptBlock = (site: ScriptSite): HTMLElement => {
  const open = action(
    '↗ Open in tab',
    () =>
      vscode.postMessage({
        kind: 'openScript',
        block: site.block,
        label: site.tab,
      }),
    'Open this script in its own editor tab',
  );
  const remove = site.remove;

  open.classList.add('bk-link');
  open.addEventListener('click', (event) => event.stopPropagation());
  return blockCard({
    key: `script:${site.block}`,
    kind: 'script',
    title: site.label,
    summary: '0x' + site.block.toString(16),
    open: site.open,
    actions: [open],
    onMove: site.onMove,
    onRemove: remove && (() => send(remove)),
    body: () => {
      const placeholder = document.createElement('div');

      placeholder.className = 'bk-script-host';
      placeholder.dataset.scriptBlock = String(site.block);
      placeholder.textContent = '…';
      return [
        ...(site.when ? [field(site.whenLabel ?? 'When', site.when())] : []),
        placeholder,
      ];
    },
    onOpen: () => vscode.postMessage({ kind: 'script', block: site.block }),
  });
};

export const showScript = (data: Extract<ToPage, { kind: 'script' }>): void => {
  host(data.block)?.replaceChildren(
    scriptField({
      block: data.block,
      text: data.text,
      mode: data.mode,
      note: data.note,
      onCommit: (text) =>
        vscode.postMessage({ kind: 'scriptEdit', block: data.block, text }),
    }),
  );
};

export const scriptSaved = (previous: number, block: number): void => {
  state.drafts.delete(previous);
  state.cards.delete(`script:${previous}`);
  state.cards.set(`script:${block}`, true);
};
