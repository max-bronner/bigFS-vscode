import { createDebouncer } from '../../core/debounce';
import { createFrameQueue } from '../../core/createFrameQueue';
import { formatCount } from '../../core/messages';
import type { PreviewLine } from '../../core/collectLineMatches';
import { element } from '../shared/element';
import { getVsCodeApi } from '../shared/vscodeApi';
import { readSearchState } from './readSearchState';
import type { SearchState } from './readSearchState';
import type {
  FileResult,
  FromSearchPage,
  SearchSummary,
  ToSearchPage,
} from './protocol';

const TYPING_DELAY = { text: 350, names: 150 };

const FRAME_BUDGET = 8;

const vscode = getVsCodeApi<FromSearchPage>();

const byId = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const queryBox = byId<HTMLInputElement>('query');
const includeBox = byId<HTMLInputElement>('include');
const excludeBox = byId<HTMLInputElement>('exclude');
const contextBox = byId<HTMLInputElement>('context');
const toggles = {
  caseSensitive: byId<HTMLButtonElement>('case'),
  wholeWord: byId<HTMLButtonElement>('word'),
  regex: byId<HTMLButtonElement>('regex'),
};
const modeButtons = {
  text: byId<HTMLButtonElement>('modeText'),
  names: byId<HTMLButtonElement>('modeNames'),
};
const contextRow = byId<HTMLElement>('contextRow');
const details = byId<HTMLElement>('details');
const detailsToggle = byId<HTMLButtonElement>('detailsToggle');
const cancelButton = byId<HTMLButtonElement>('cancel');
const statusLine = byId<HTMLElement>('status');
const notes = byId<HTMLElement>('notes');
const results = byId<HTMLElement>('results');

interface ArchiveGroup {
  files: HTMLElement;
  badge: HTMLElement;
  matchCount: number;
}

let searchId = 0;
let isRunning = false;
let totalFiles = 0;
let totalMatches = 0;
let groups = new Map<string, ArchiveGroup>();

const openRequests = new WeakMap<Element, Extract<FromSearchPage, { kind: 'open' }>>();

const isOn = (button: HTMLButtonElement): boolean =>
  button.getAttribute('aria-pressed') === 'true';

const getTarget = (): 'text' | 'names' => (isOn(modeButtons.names) ? 'names' : 'text');

const showTarget = (target: 'text' | 'names'): void => {
  modeButtons.text.setAttribute('aria-pressed', String(target === 'text'));
  modeButtons.names.setAttribute('aria-pressed', String(target === 'names'));
  contextRow.hidden = target === 'names';
  queryBox.placeholder = target === 'names' ? 'Search file names' : 'Search';
};

const showDetails = (isOpen: boolean): void => {
  const hasFilter = Boolean(includeBox.value || excludeBox.value);

  details.hidden = !isOpen;
  detailsToggle.setAttribute('aria-expanded', String(isOpen));
  detailsToggle.classList.toggle('filtered', !isOpen && hasFilter);
  detailsToggle.title = !isOpen && hasFilter
    ? 'Toggle Search Details (files to include or exclude are set)'
    : 'Toggle Search Details';
};

const save = (): void => {
  const state: SearchState = {
    text: queryBox.value,
    include: includeBox.value,
    exclude: excludeBox.value,
    contextLines: contextBox.value,
    caseSensitive: isOn(toggles.caseSensitive),
    wholeWord: isOn(toggles.wholeWord),
    regex: isOn(toggles.regex),
    target: getTarget(),
    isDetailsOpen: !details.hidden,
  };

  vscode.setState(state);
};

const setStatus = (text: string, isError = false): void => {
  statusLine.textContent = text;
  statusLine.classList.toggle('error', isError);
};

const renderLineText = ({ text, ranges = [] }: PreviewLine): HTMLElement => {
  const span = element('span', undefined, 'text');
  let at = 0;

  for (const [start, end] of ranges) {
    if (start >= at) {
      span.append(
        text.slice(at, start),
        element('mark', text.slice(start, end)),
      );
      at = end;
    }
  }

  span.append(text.slice(at));

  return span;
};

const makeFoldable = (heading: HTMLElement, body: HTMLElement): void => {
  const twisty = element('span', '▾', 'twisty');
  const toggle = (): void => {
    body.hidden = !body.hidden;
    twisty.textContent = body.hidden ? '▸' : '▾';
  };

  heading.prepend(twisty);
  heading.tabIndex = 0;
  heading.addEventListener('click', toggle);
  heading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });
};

const getGroup = (file: FileResult): ArchiveGroup => {
  const key = `${file.archiveFolder}${file.archive}`;
  let group = groups.get(key);

  if (!group) {
    const heading = element('div', undefined, 'archive');
    const files = element('div');
    const badge = element('span', '0', 'badge');

    heading.append(
      element('span', file.archive, 'name'),
      element('span', file.archiveFolder, 'detail'),
      badge,
    );
    makeFoldable(heading, files);
    results.append(heading, files);
    group = { files, badge, matchCount: 0 };
    groups.set(key, group);
  }

  return group;
};

const renderNameResult = (file: FileResult): void => {
  const row = element('div', undefined, 'file name-result');
  const [line] = file.blocks[0]?.lines ?? [{ line: 0, text: file.entryPath }];

  row.title = `${file.archiveFolder}${file.archive}/${file.entryPath}`;
  row.tabIndex = 0;
  row.append(renderLineText(line), element('span', file.archive, 'detail'));
  openRequests.set(row, { kind: 'open', uri: file.uri, isWhole: true, line: 0, start: 0, end: 0 });
  results.append(row);
};

const renderFile = (file: FileResult): void => {
  if (file.isNameMatch) {
    renderNameResult(file);
    return;
  }

  const group = getGroup(file);
  const heading = element('div', undefined, 'file');
  const blocks = element('div');
  const folder = file.entryPath.slice(0, file.entryPath.lastIndexOf('/') + 1);

  heading.title = `${file.archive}/${file.entryPath}`;
  heading.append(
    element('span', file.entryPath.slice(folder.length), 'name'),
    element('span', folder, 'detail'),
    element('span', String(file.matchCount), 'badge'),
  );
  makeFoldable(heading, blocks);

  for (const block of file.blocks) {
    const box = element('div', undefined, 'block');

    for (const line of block.lines) {
      const row = element('div', undefined, line.ranges ? 'line hit' : 'line');
      const [start, end] = line.selection ?? [0, 0];

      row.append(
        element('span', String(line.line + 1), 'number'),
        renderLineText(line),
      );
      openRequests.set(row, { kind: 'open', uri: file.uri, line: line.line, start, end });
      box.append(row);
    }

    blocks.append(box);
  }

  group.files.append(heading, blocks);
  group.matchCount += file.matchCount;
  group.badge.textContent = String(group.matchCount);
};

const drawing = createFrameQueue<FileResult>({
  render: renderFile,
  budgetMilliseconds: FRAME_BUDGET,
  requestFrame: (callback) => requestAnimationFrame(callback),
  now: () => performance.now(),
});

const openRow = (target: EventTarget | null): boolean => {
  const row = target instanceof Element ? target.closest('.name-result, .line') : null;
  const request = row && openRequests.get(row);

  if (request) {
    vscode.postMessage(request);
  }

  return Boolean(request);
};

const describeProgress = (archive?: string): string =>
  `${formatCount(totalMatches, 'result')} in ${formatCount(totalFiles, 'file')}${archive ? ` · searching ${archive}` : ''}`;

const finish = (summary: SearchSummary): void => {
  isRunning = false;
  cancelButton.hidden = true;

  if (!summary.matchCount) {
    setStatus(
      summary.isCancelled
        ? 'Search cancelled.'
        : `No results in ${formatCount(summary.searchedCount, getTarget() === 'names' ? 'file' : 'text file')}.`,
    );
  } else {
    setStatus(
      `${describeProgress()}${summary.isCancelled ? ' · cancelled' : ''}`,
    );
  }

  notes.textContent = [
    summary.isLimitHit
      ? `Stopped at the first ${summary.matchCount} results; narrow the query or the files to include.`
      : '',
    summary.isPatternSlow
      ? `Stopped: the pattern took too long on ${formatCount(summary.slowCount, 'file')}. It probably backtracks without end.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const startSearch = (): void => {
  save();

  if (!queryBox.value) {
    vscode.postMessage({ kind: 'cancel' });
    searchId += 1;
    isRunning = false;
    cancelButton.hidden = true;
    drawing.clear();
    results.replaceChildren();
    notes.textContent = '';
    setStatus('');
    return;
  }

  searchId += 1;
  isRunning = true;
  totalFiles = 0;
  totalMatches = 0;
  groups = new Map();
  drawing.clear();
  results.replaceChildren();
  notes.textContent = '';
  cancelButton.hidden = getTarget() === 'names';
  setStatus('Searching…');
  vscode.postMessage({
    kind: 'search',
    id: searchId,
    request: {
      query: {
        text: queryBox.value,
        caseSensitive: isOn(toggles.caseSensitive),
        wholeWord: isOn(toggles.wholeWord),
        regex: isOn(toggles.regex),
      },
      target: getTarget(),
      include: includeBox.value,
      exclude: excludeBox.value,
      contextLines: Math.max(0, Math.min(10, Number(contextBox.value) || 0)),
    },
  });
};

const typing = {
  text: createDebouncer(startSearch, TYPING_DELAY.text),
  names: createDebouncer(startSearch, TYPING_DELAY.names),
};

const cancelTyping = (): void => {
  typing.text.cancel();
  typing.names.cancel();
};

window.addEventListener('message', ({ data }: MessageEvent<ToSearchPage>) => {
  if (data.kind === 'focus') {
    if (data.query) {
      queryBox.value = data.query;
      startSearch();
    }

    queryBox.focus();
    queryBox.select();
    return;
  }

  if (data.id !== searchId) {
    return;
  }

  switch (data.kind) {
    case 'progress':
      setStatus(describeProgress(data.archive));
      break;
    case 'files':
      for (const file of data.files) {
        totalFiles += 1;
        totalMatches += file.matchCount;
      }
      drawing.push(data.files);
      break;
    case 'finished':
      finish(data.summary);
      break;
    case 'failed':
      isRunning = false;
      cancelButton.hidden = true;
      setStatus(data.message, true);
      break;
  }
});

for (const box of [queryBox, includeBox, excludeBox, contextBox]) {
  box.addEventListener('input', () => {
    cancelTyping();
    typing[getTarget()].schedule();
  });
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      cancelTyping();
      startSearch();
    }
  });
}

results.addEventListener('click', (event) => openRow(event.target));
results.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && openRow(event.target)) {
    event.preventDefault();
  }
});

for (const button of Object.values(toggles)) {
  button.addEventListener('click', () => {
    button.setAttribute('aria-pressed', String(!isOn(button)));
    cancelTyping();
    startSearch();
  });
}

for (const [target, button] of Object.entries(modeButtons) as ['text' | 'names', HTMLButtonElement][]) {
  button.addEventListener('click', () => {
    if (getTarget() !== target) {
      showTarget(target);
      cancelTyping();
      startSearch();
    }
  });
}

detailsToggle.addEventListener('click', () => {
  showDetails(Boolean(details.hidden));
  save();
});

cancelButton.addEventListener('click', () => {
  if (isRunning) {
    vscode.postMessage({ kind: 'cancel' });
    searchId += 1;
    isRunning = false;
    cancelButton.hidden = true;
    setStatus(`${describeProgress()} · cancelled`);
  }
});

const saved = readSearchState(vscode.getState());

queryBox.value = saved.text;
includeBox.value = saved.include;
excludeBox.value = saved.exclude;
contextBox.value = saved.contextLines;
toggles.caseSensitive.setAttribute('aria-pressed', String(saved.caseSensitive));
toggles.wholeWord.setAttribute('aria-pressed', String(saved.wholeWord));
toggles.regex.setAttribute('aria-pressed', String(saved.regex));
showTarget(saved.target);
showDetails(saved.isDetailsOpen);

vscode.postMessage({ kind: 'ready' });
