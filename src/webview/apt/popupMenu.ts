export interface MenuAction {
  label: string;
  run: () => void;
  key?: string;
  title?: string;
  checked?: boolean;
  enabled?: boolean;
}

export type MenuEntry = MenuAction | 'separator' | { heading: string };

export type MenuPlace = { below: HTMLElement } | { x: number; y: number };

let shown: { element: HTMLElement; close: (returnFocus: boolean) => void } | undefined;

export const closeMenu = (): void => shown?.close(false);

const createItem = (action: MenuAction, choose: () => void): HTMLButtonElement => {
  const item = document.createElement('button');
  const check = document.createElement('span');
  const label = document.createElement('span');

  item.className = 'menu-item';
  item.type = 'button';
  item.setAttribute('role', action.checked === undefined ? 'menuitem' : 'menuitemcheckbox');
  if (action.checked !== undefined) {
    item.setAttribute('aria-checked', String(action.checked));
  }
  check.className = 'menu-check';
  check.textContent = action.checked ? '✓' : '';
  label.className = 'menu-label';
  label.textContent = action.label;
  item.append(check, label);
  if (action.key) {
    const key = document.createElement('span');

    key.className = 'menu-key';
    key.textContent = action.key;
    item.append(key);
  }
  item.title = action.title ?? '';
  item.disabled = action.enabled === false;
  item.onclick = choose;
  return item;
};

const place = (element: HTMLElement, at: MenuPlace) => {
  const box = element.getBoundingClientRect();
  let left: number;
  let top: number;

  if ('below' in at) {
    const anchor = at.below.getBoundingClientRect();

    left = anchor.left;
    top = anchor.bottom + 2;
    if (top + box.height > window.innerHeight && anchor.top - box.height - 2 >= 0) {
      top = anchor.top - box.height - 2;
    }
  } else {
    left = at.x;
    top = at.y;
    if (top + box.height > window.innerHeight) {
      top = at.y - box.height;
    }
  }
  element.style.left = `${Math.max(0, Math.min(left, window.innerWidth - box.width - 2))}px`;
  element.style.top = `${Math.max(0, Math.min(top, window.innerHeight - box.height - 2))}px`;
};

export const openMenu = (
  entries: MenuEntry[],
  at: MenuPlace,
  returnTo: HTMLElement,
  onClose?: () => void,
): void => {
  closeMenu();

  const element = document.createElement('div');
  const close = (returnFocus: boolean) => {
    if (shown?.element !== element) {
      return;
    }
    shown = undefined;
    element.remove();
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('blur', lose);
    window.removeEventListener('resize', lose);
    onClose?.();
    if (returnFocus) {
      returnTo.focus();
    }
  };
  const outside = (event: Event) => {
    const target = event.target as Node;

    if (!element.contains(target) && !('below' in at && at.below.contains(target))) {
      close(false);
    }
  };
  const lose = () => close(false);

  element.className = 'menu';
  element.setAttribute('role', 'menu');
  for (const entry of entries) {
    if (entry === 'separator') {
      const line = document.createElement('div');

      line.className = 'menu-separator';
      line.setAttribute('role', 'separator');
      element.append(line);
    } else if ('heading' in entry) {
      const heading = document.createElement('div');

      heading.className = 'menu-heading';
      heading.textContent = entry.heading;
      element.append(heading);
    } else {
      element.append(
        createItem(entry, () => {
          close(true);
          entry.run();
        }),
      );
    }
  }

  const items = () =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)'));

  element.addEventListener('keydown', (event) => {
    const list = items();
    const focused = list.indexOf(document.activeElement as HTMLButtonElement);
    const moves: Record<string, () => number> = {
      ArrowDown: () => (focused + 1) % list.length,
      ArrowUp: () => (focused - 1 + list.length) % list.length,
      Home: () => 0,
      End: () => list.length - 1,
    };

    if (event.key in moves) {
      if (list.length) {
        list[moves[event.key]()].focus();
      }
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      close(true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (focused >= 0) {
        list[focused].click();
      }
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener('contextmenu', (event) => event.preventDefault());

  document.body.append(element);
  place(element, at);
  shown = { element, close };
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('blur', lose);
  window.addEventListener('resize', lose);
  (items()[0] ?? element).focus();
};

export const attachMenu = <Button extends HTMLButtonElement>(
  button: Button,
  entries: () => MenuEntry[],
): Button => {
  const open = () => {
    button.setAttribute('aria-expanded', 'true');
    openMenu(entries(), { below: button }, button, () =>
      button.setAttribute('aria-expanded', 'false'),
    );
  };

  button.classList.add('menu-button');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () =>
    button.getAttribute('aria-expanded') === 'true' ? closeMenu() : open(),
  );
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open();
    }
  });
  return button;
};
