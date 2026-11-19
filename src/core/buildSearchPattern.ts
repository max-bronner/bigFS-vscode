export interface SearchQuery {
  text: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export type SearchPattern =
  | { source: string; flags: string }
  | { error: string };

const isWordCharacter = (character: string | undefined): boolean =>
  character !== undefined && /\w/.test(character);

export const buildSearchPattern = (query: SearchQuery): SearchPattern => {
  if (!query.text) {
    return { error: 'Type something to search for.' };
  }

  const body = query.regex
    ? query.text
    : query.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const before =
    query.wholeWord && (query.regex || isWordCharacter(query.text[0]))
      ? '\\b'
      : '';
  const after =
    query.wholeWord && (query.regex || isWordCharacter(query.text.at(-1)))
      ? '\\b'
      : '';
  const source = query.wholeWord ? `${before}(?:${body})${after}` : body;
  const flags = query.caseSensitive ? 'gm' : 'gim';

  try {
    new RegExp(source, flags);
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : 'Invalid regular expression',
    };
  }

  return { source, flags };
};
