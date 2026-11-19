import { stripComment, tokenize } from '../ini/sageIniParser';
import type { SageToken } from '../ini/sageIniParser';

export interface IniLine {
  line: number;
  keyword: SageToken;
  values: SageToken[];
  module: string;
  moduleType: string;
  moduleIndex: number;
}

export interface IniModule {
  slot: string;
  type: string;
  line: number;
}

export interface IniDefinition {
  keyword: string;
  name: string;
  startLine: number;
  endLine: number;
  lines: IniLine[];
  modules: IniModule[];
}

const SLOTS = new Set(
  [
    'System',
    'EmissionVelocity',
    'EmissionVolume',
    'Color',
    'Update',
    'Draw',
    'Physics',
    'Alpha',
    'Wind',
    'Event',
    'Emitter',
  ].map((slot) => slot.toLowerCase()),
);

export const DEFINITION_KEYWORDS = [
  'FXParticleSystem',
  'ParticleSystem',
  'FXList',
] as const;

const isEnd = (word: string) => /^end$/i.test(word);

export const findParticleDefinitions = (text: string): IniDefinition[] => {
  const lines = text.split(/\r?\n/);
  const found: IniDefinition[] = [];
  let open: IniDefinition | undefined;
  let module: { slot: string; type: string } | undefined;

  lines.forEach((raw, line) => {
    const tokens = tokenize(stripComment(raw));
    const [keyword, ...values] = tokens;

    if (!keyword) {
      return;
    }

    if (!open) {
      const kind = DEFINITION_KEYWORDS.find(
        (candidate) => candidate.toLowerCase() === keyword.text.toLowerCase(),
      );

      if (kind && values[0]) {
        open = {
          keyword: kind,
          name: values[0].text,
          startLine: line,
          endLine: line,
          lines: [],
          modules: [],
        };
      }
      return;
    }

    if (isEnd(keyword.text)) {
      if (module) {
        module = undefined;
      } else {
        open.endLine = line;
        found.push(open);
        open = undefined;
      }
      return;
    }

    const hasEquals = /=/.test(stripComment(raw));
    const opensModule =
      !module &&
      (open.keyword === 'FXParticleSystem'
        ? SLOTS.has(keyword.text.toLowerCase())
        : open.keyword === 'FXList' && !hasEquals);

    if (opensModule) {
      module = { slot: keyword.text, type: values[0]?.text ?? keyword.text };
      open.modules.push({ ...module, line });
      return;
    }

    open.lines.push({
      line,
      keyword,
      values,
      module: module?.slot ?? '',
      moduleType: module?.type ?? '',
      moduleIndex: module ? open.modules.length - 1 : -1,
    });
  });

  return found;
};

export const parseIniNumber = (text: string): number => {
  const match = /^(?:[A-Za-z]:)?(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)%?$/i.exec(
    text,
  );

  return match ? Number(match[1]) : NaN;
};
