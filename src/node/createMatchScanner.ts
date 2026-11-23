import { Script, createContext } from 'vm';

export interface ScanResult {
  matches: number[];
  timedOut: boolean;
}

export type MatchScanner = (text: string, maxMatches: number) => ScanResult;

const SCAN_SCRIPT = new Script(`(() => {
  const found = [];
  const re = new RegExp(source, flags);
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }

    found.push(match.index, match[0].length);

    if (found.length >= maxMatches * 2) {
      break;
    }
  }

  return found;
})()`);

const scanDirectly = (re: RegExp, text: string, maxMatches: number): number[] => {
  const found: number[] = [];
  let match: RegExpExecArray | null;

  re.lastIndex = 0;

  while ((match = re.exec(text)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }

    found.push(match.index, match[0].length);

    if (found.length >= maxMatches * 2) {
      break;
    }
  }

  return found;
};

export const createMatchScanner = (
  source: string,
  flags: string,
  timeoutMilliseconds?: number,
): MatchScanner => {
  if (timeoutMilliseconds === undefined) {
    const re = new RegExp(source, flags.includes('g') ? flags : `${flags}g`);

    return (text, maxMatches) => ({
      matches: scanDirectly(re, text, maxMatches),
      timedOut: false,
    });
  }

  const sandbox = createContext({
    source,
    flags,
    text: '',
    maxMatches: 0,
  }) as { text: string; maxMatches: number };

  return (text, maxMatches) => {
    sandbox.text = text;
    sandbox.maxMatches = maxMatches;

    try {
      const matches = SCAN_SCRIPT.runInContext(sandbox, {
        timeout: timeoutMilliseconds,
      }) as number[];

      return { matches: Array.from(matches), timedOut: false };
    } catch {
      return { matches: [], timedOut: true };
    } finally {
      sandbox.text = '';
    }
  };
};
