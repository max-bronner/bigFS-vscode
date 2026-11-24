import type { ConverterKind } from '../../core/converterFileTypes';

export type { ConverterKind };

export interface ListedFile {
  uri: string;
  name: string;
}

export type FromConvertersPage =
  | { kind: 'ready' }
  | { kind: 'pick'; converter: ConverterKind }
  | { kind: 'listed'; converter: ConverterKind; uris: string[] }
  | { kind: 'convert'; converter: ConverterKind; uris: string[] };

export type ToConvertersPage = {
  kind: 'add';
  converter: ConverterKind;
  files: ListedFile[];
  skipped: string[];
};
