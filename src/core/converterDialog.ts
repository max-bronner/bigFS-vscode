export interface ConverterOption {
  value: string;
  label: string;
  group?: string;
}

export type ConverterField =
  | { kind: 'select'; id: string; label: string; options: ConverterOption[] }
  | {
      kind: 'number';
      id: string;
      label: string;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    }
  | { kind: 'checkbox'; id: string; label: string };

export type ConverterValues = Record<string, string | number | boolean>;

export interface ConverterReview {
  errors: string[];
  warnings: string[];
  notes: string[];
  hidden: string[];
}

export interface ConverterFile {
  name: string;
  detail?: string;
}

export interface ConverterDialogContent {
  heading: string;
  about: string;
  files: ConverterFile[];
  skipped: string[];
  fields: ConverterField[];
  values: ConverterValues;
  review: ConverterReview;
}

export type ToConverterDialog =
  | ({ kind: 'show' } & ConverterDialogContent)
  | { kind: 'review'; review: ConverterReview }
  | { kind: 'started' }
  | { kind: 'progress'; text: string; fraction?: number }
  | { kind: 'log'; text: string; isError?: boolean }
  | { kind: 'finished'; text: string }
  | { kind: 'decode'; id: number; bytes: Uint8Array };

export type FromConverterDialog =
  | { kind: 'ready' }
  | { kind: 'change'; values: ConverterValues }
  | { kind: 'convert'; values: ConverterValues }
  | { kind: 'cancel' }
  | { kind: 'decoded'; id: number; width: number; height: number; pixels: Uint8Array }
  | { kind: 'decodeFailed'; id: number; message: string };

export const createReview = (): ConverterReview => ({
  errors: [],
  warnings: [],
  notes: [],
  hidden: [],
});

export const OUTPUT_FIELD: ConverterField = {
  kind: 'select',
  id: 'output',
  label: 'Write to',
  options: [
    { value: 'beside', label: 'Beside each file' },
    { value: 'folder', label: 'A folder I choose' },
  ],
};
