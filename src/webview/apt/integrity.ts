import type { Problem } from '../../formats/apt/aptIntegrity';
import { byId } from './dom';

const panel = byId('integrity');

export const showIntegrity = (
  problems: Problem[],
  select: (character: number) => void,
): void => {
  const count = (severity: Problem['severity']) =>
    problems.filter((problem) => problem.severity === severity).length;
  const errors = count('error');
  const warnings = count('warning');
  const header = document.createElement('div');

  header.textContent =
    errors || warnings
      ? `Integrity: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`
      : 'Integrity: the movie and its files hold together';
  header.className = errors ? 'error' : warnings ? 'warning' : 'info';

  const rows = problems.map((problem) => {
    const element = document.createElement('div');

    element.className = `problem ${problem.severity}`;
    element.textContent = `${problem.severity === 'error' ? '✖' : problem.severity === 'warning' ? '⚠' : 'ℹ'} ${problem.message}`;
    if (problem.character !== undefined) {
      const character = problem.character;

      element.dataset.character = String(character);
      element.title = `Select #${character}`;
      element.onclick = () => select(character);
    }
    return element;
  });

  panel.replaceChildren(header, ...rows);
};
