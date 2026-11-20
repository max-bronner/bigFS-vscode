import type { Uri } from 'vscode';
import { createParseCache } from './workspaceText';
import { readAudioDefinition } from '../../game/audio/sageAudioResolve';
import type { AudioLookup } from '../../game/audio/sageAudioResolve';
import { forEachBlock } from '../../formats/ini/sageIniParser';
import type { SageIniDocuments } from './sageIniDocuments';
import type { SageIniIndex } from './sageIniIndex';

export const AUDIO_KEYWORDS = [
  'AudioEvent',
  'DialogEvent',
  'MusicTrack',
  'AmbientStream',
  'StreamedSound',
  'Multisound',
  'NewEvaEvent',
  'PredefinedEvaEvent',
];

const VIDEO_KEYWORD = 'Video';

const PARSE_REUSE_MS = 5000;

export const createAudioLookup = (
  index: SageIniIndex,
  documents: SageIniDocuments,
): ((name: string, from?: Uri) => ReturnType<AudioLookup>) => {
  const cache = createParseCache(documents);
  let cachedAt = Date.now();

  return async (name, from) => {
    if (Date.now() - cachedAt > PARSE_REUSE_MS) {
      cache.clear();
      cachedAt = Date.now();
    }
    for (const keyword of [...AUDIO_KEYWORDS, VIDEO_KEYWORD]) {
      const [place] = index.findDefinitions(keyword, name, from);
      const parsed = place && (await cache.get(place.uri));

      if (!place || !parsed) {
        continue;
      }

      let found: ReturnType<typeof readAudioDefinition> | undefined;

      forEachBlock(parsed.blocks, (block) => {
        if (!found && block.startLine === place.line) {
          found = readAudioDefinition(parsed, block);
        }
      });
      if (found) {
        return found;
      }
    }
    return undefined;
  };
};
