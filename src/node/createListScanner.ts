import { Script, createContext } from 'vm';
import type { ScanResult } from './createMatchScanner';

export type ListScanner = (
  texts: readonly string[],
  maxMatchesPerText: number,
  maxMatches: number,
) => ScanResult;

const SCAN_SCRIPT = new Script(`(() => {
  // Read once: every read of the sandbox's own properties passes through its guard
  const list = texts;
  const perText = maxMatchesPerText;
  const limit = maxMatches * 3;
  const found = [];
  const re = new RegExp(source, flags);

  for (let index = 0; index < list.length && found.length < limit; index += 1) {
    const text = list[index];
    let count = 0;
    let match;

    re.lastIndex = 0;

    while (count < perText && found.length < limit && (match = re.exec(text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }

      found.push(index, match.index, match[0].length);
      count += 1;
    }
  }

  return found;
})()`);

const scanDirectly = (
  re: RegExp,
  texts: readonly string[],
  maxMatchesPerText: number,
  maxMatches: number,
): number[] => {
  const found: number[] = [];

  for (let index = 0; index < texts.length && found.length < maxMatches * 3; index += 1) {
    const text = texts[index];
    let count = 0;
    let match: RegExpExecArray | null;

    re.lastIndex = 0;

    while (count < maxMatchesPerText && found.length < maxMatches * 3 && (match = re.exec(text)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }

      found.push(index, match.index, match[0].length);
      count += 1;
    }
  }

  return found;
};

export const createListScanner = (
  source: string,
  flags: string,
  timeoutMilliseconds?: number,
): ListScanner => {
  const globalFlags = flags.includes('g') ? flags : `${flags}g`;

  if (timeoutMilliseconds === undefined) {
    const re = new RegExp(source, globalFlags);

    return (texts, maxMatchesPerText, maxMatches) => ({
      matches: scanDirectly(re, texts, maxMatchesPerText, maxMatches),
      timedOut: false,
    });
  }

  const sandbox = createContext({
    source,
    flags: globalFlags,
    texts: [],
    maxMatchesPerText: 0,
    maxMatches: 0,
  }) as { texts: readonly string[]; maxMatchesPerText: number; maxMatches: number };

  return (texts, maxMatchesPerText, maxMatches) => {
    sandbox.texts = texts;
    sandbox.maxMatchesPerText = maxMatchesPerText;
    sandbox.maxMatches = maxMatches;

    try {
      const matches = SCAN_SCRIPT.runInContext(sandbox, {
        timeout: timeoutMilliseconds,
      }) as number[];

      return { matches: Array.from(matches), timedOut: false };
    } catch {
      return { matches: [], timedOut: true };
    } finally {
      sandbox.texts = [];
    }
  };
};
