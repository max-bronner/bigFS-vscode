export interface StringRow {
  id: number;
  label: string;
  text: string;
  hasText?: boolean;
  speech?: string;
  extra?: number;
  problems?: string[];
}

export type FromStringsPage =
  | { kind: 'ready' }
  | {
      kind: 'setText' | 'setLabel' | 'setSpeech';
      id: number;
      label: string;
      value: string;
    }
  | { kind: 'add'; label: string; value: string }
  | { kind: 'remove'; id: number; label: string }
  | { kind: 'reveal'; id: number };

export type StringsToPage =
  | {
      kind: 'table';
      rows: StringRow[];
      hasSpeech: boolean;
      canReveal: boolean;
      summary: string;
    }
  | { kind: 'notice'; message: string };
