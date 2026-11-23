import { element } from '../shared/element';
import type { FileUse } from './protocol';

const REVEAL_TITLE = 'Open the line in the INI';

const createUseLink = (use: FileUse, reveal: (use: FileUse) => void): HTMLAnchorElement => {
  const link = element(
    'a',
    `${use.owner ?? use.uri.slice(use.uri.lastIndexOf('/') + 1)} (${use.field}, line ${use.line + 1})`,
  );

  link.href = '#';
  link.title = REVEAL_TITLE;
  if (use.location) {
    link.append(element('span', use.location.container, 'where'));
    link.title = `${REVEAL_TITLE}\n${use.location.detail}`;
  }
  link.onclick = (event) => {
    event.preventDefault();
    reveal(use);
  };
  return link;
};

export const listFileUses = (
  uses: readonly FileUse[],
  reveal: (use: FileUse) => void,
  getExtra: (use: FileUse) => (string | HTMLElement)[] = () => [],
): (string | HTMLElement)[] => {
  if (!uses.length) {
    return ['No INI file the index holds uses this file'];
  }
  return uses.map((use) => {
    const row = element('div');

    row.append(createUseLink(use, reveal), ...getExtra(use));
    return row;
  });
};
