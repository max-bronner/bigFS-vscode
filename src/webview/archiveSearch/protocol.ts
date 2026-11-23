import type { SearchQuery } from '../../core/buildSearchPattern';
import type { MatchBlock } from '../../core/collectLineMatches';

export interface SearchRequest {
  query: SearchQuery;
  target?: 'text' | 'names';
  include: string;
  exclude: string;
  contextLines: number;
}

export interface FileResult {
  archive: string;
  archiveFolder: string;
  entryPath: string;
  uri: string;
  blocks: MatchBlock[];
  matchCount: number;
  isNameMatch?: boolean;
}

export interface SearchSummary {
  fileCount: number;
  matchCount: number;
  searchedCount: number;
  isLimitHit: boolean;
  isCancelled: boolean;
  isPatternSlow: boolean;
  slowCount: number;
}

export type ToSearchPage =
  | { kind: 'started'; id: number }
  | { kind: 'progress'; id: number; archive: string }
  | { kind: 'files'; id: number; files: FileResult[] }
  | { kind: 'finished'; id: number; summary: SearchSummary }
  | { kind: 'failed'; id: number; message: string }
  | { kind: 'focus'; query?: string };

export type FromSearchPage =
  | { kind: 'ready' }
  | { kind: 'search'; id: number; request: SearchRequest }
  | { kind: 'cancel' }
  | {
      kind: 'open';
      uri: string;
      isWhole?: boolean;
      line: number;
      start: number;
      end: number;
    };
