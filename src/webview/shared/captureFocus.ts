const FOCUSABLE = 'input, select, textarea, button';

export const captureFocus = (container: HTMLElement): (() => void) => {
  const active = document.activeElement;

  if (!(active instanceof HTMLElement) || !container.contains(active)) {
    return () => {};
  }

  const position = [...container.querySelectorAll(FOCUSABLE)].indexOf(active);
  const caret =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? ([active.selectionStart, active.selectionEnd] as const)
      : undefined;

  return () => {
    const found = container.querySelectorAll<HTMLElement>(FOCUSABLE)[position];

    if (position < 0 || !found) {
      return;
    }
    found.focus();
    if (caret && caret[0] !== null && caret[1] !== null) {
      try {
        (found as HTMLInputElement).setSelectionRange(caret[0], caret[1]);
      } catch {
      }
    }
  };
};
