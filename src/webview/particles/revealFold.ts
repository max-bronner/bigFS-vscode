export const revealFold = (fold: HTMLDetailsElement): void => {
  for (let around: HTMLElement | null = fold; around; around = around.parentElement) {
    if (around instanceof HTMLDetailsElement && !around.open) {
      const summary = around.querySelector(':scope > summary');

      if (summary instanceof HTMLElement) {
        summary.click();
      } else {
        around.open = true;
      }
    }
  }
  fold.scrollIntoView({ block: 'nearest' });
};
