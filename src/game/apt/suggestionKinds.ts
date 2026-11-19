export type SuggestionKind =
  | 'side'
  | 'sideState'
  | 'factionIcon'
  | 'rankIcon'
  | 'buttonImage'
  | 'powerIcon'
  | 'spellImage'
  | 'classIcon'
  | 'typeIcon'
  | 'heroImage'
  | 'unitPortrait'
  | 'colourHex'
  | 'colourArgb';

export const SUGGESTION_KINDS: readonly SuggestionKind[] = [
  'side',
  'sideState',
  'factionIcon',
  'rankIcon',
  'buttonImage',
  'powerIcon',
  'spellImage',
  'classIcon',
  'typeIcon',
  'heroImage',
  'unitPortrait',
  'colourHex',
  'colourArgb',
];

export interface SuggestionOption {
  value: string;
  label?: string;
}

export interface FixedSet {
  id: string;
  options: readonly SuggestionOption[];
  isPartial?: boolean;
}

export type SuggestionRule = { basis: string } & (
  | { kind: SuggestionKind }
  | { fixed: FixedSet }
);

export type ParameterRule = SuggestionRule & {
  call: RegExp;
  parameter: RegExp;
};

export type NamedRule = SuggestionRule & { name: RegExp };
