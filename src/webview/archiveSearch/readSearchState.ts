export interface SearchState {
  text: string;
  include: string;
  exclude: string;
  contextLines: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  target: 'text' | 'names';
  isDetailsOpen: boolean;
}

export const DEFAULT_SEARCH_STATE: SearchState = {
  text: '',
  include: '',
  exclude: '',
  contextLines: '2',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  target: 'text',
  isDetailsOpen: false,
};

export const readSearchState = (saved: unknown): SearchState => {
  const fields = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
  const read = <K extends keyof SearchState>(key: K): SearchState[K] =>
    typeof fields[key] === typeof DEFAULT_SEARCH_STATE[key]
      ? (fields[key] as SearchState[K])
      : DEFAULT_SEARCH_STATE[key];
  const include = read('include');
  const exclude = read('exclude');

  return {
    text: read('text'),
    include,
    exclude,
    contextLines: read('contextLines'),
    caseSensitive: read('caseSensitive'),
    wholeWord: read('wholeWord'),
    regex: read('regex'),
    target: fields.target === 'names' ? 'names' : 'text',
    isDetailsOpen:
      typeof fields.isDetailsOpen === 'boolean'
        ? fields.isDetailsOpen
        : Boolean(include || exclude),
  };
};
