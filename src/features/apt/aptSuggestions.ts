import { PALANTIR_STATES } from '../../game/apt/engineSuggestions';
import { IMAGE_NAME_PATTERNS } from '../../game/apt/iniSuggestionRules';
import type { SuggestionKind, SuggestionOption } from '../../game/apt/suggestionKinds';
import type { HeroSystem } from '../../game/objects/cahSystem';
import { readDefinitionFields } from './aptDefinitionFields';
import type { DefinitionFields, ReadText, SuggestionIndex } from './aptDefinitionFields';
import {
  readClassIcons,
  readHeroImages,
  readTypeIcons,
  readUnitPortraits,
} from './aptObjectSuggestions';
import type { ComposeObject } from './aptObjectSuggestions';

export type { ReadText, SuggestionIndex } from './aptDefinitionFields';

export const MAX_OPTIONS = 5000;

export interface SuggestionSources {
  index: SuggestionIndex;
  read: ReadText;
  readHeroSystem(): Promise<HeroSystem | undefined>;
  composeObject: ComposeObject;
}

interface SideFacts {
  side: string;
  evil: boolean;
  playable: boolean;
}

const NO_POWER_BUTTON = 'command_specialabilitynopowerdummy';

const isYes = (value: string | undefined): boolean =>
  /^yes$/i.test(value ?? '');

const hasValue = (value: string | undefined): boolean =>
  !!value && !/^none$/i.test(value);

const readSides = async ({ index, read }: SuggestionSources): Promise<SideFacts[]> => {
  const sides = new Map<string, SideFacts>();

  for (const { fields } of await readDefinitionFields(index, 'PlayerTemplate', read)) {
    const side = fields.get('side');

    if (side && !sides.has(side.toLowerCase())) {
      sides.set(side.toLowerCase(), {
        side,
        evil: isYes(fields.get('evil')),
        playable: isYes(fields.get('playableside')),
      });
    }
  }
  return [...sides.values()];
};

const describeSide = ({ evil, playable }: SideFacts): string =>
  playable ? (evil ? 'evil' : 'good') : 'not playable';

const sideOptions = (sides: readonly SideFacts[]): SuggestionOption[] =>
  sides.map((each) => ({ value: each.side, label: describeSide(each) }));

const sideStateOptions = (sides: readonly SideFacts[]): SuggestionOption[] =>
  sides.length
    ? PALANTIR_STATES.map(({ value, evil, note }) => {
        const named = sides
          .filter((each) => each.evil === evil && each.playable)
          .map((each) => each.side);

        return {
          value,
          label: named.length ? `${note}: ${named.join(', ')}` : note,
        };
      })
    : [];

const imageNameOptions = (
  { index }: SuggestionSources,
  pattern: RegExp,
): SuggestionOption[] =>
  index
    .getNames('MappedImage')
    .filter((name) => pattern.test(name))
    .map((value) => ({ value }));

const buttonImageOptions = async (
  { index, read }: SuggestionSources,
  accepts: (button: DefinitionFields) => boolean = () => true,
): Promise<SuggestionOption[]> => {
  const images = new Map<string, string>();

  for (const button of await readDefinitionFields(index, 'CommandButton', read)) {
    const image = button.fields.get('buttonimage');

    if (image && accepts(button) && !images.has(image.toLowerCase())) {
      images.set(image.toLowerCase(), image);
    }
  }
  return [...images.values()].sort().map((value) => ({ value }));
};

const isHeroPower = ({ definition, fields }: DefinitionFields): boolean =>
  hasValue(fields.get('createaherouiallowableupgrades')) ||
  definition.name.toLowerCase() === NO_POWER_BUTTON;

const isSpell = ({ fields }: DefinitionFields): boolean =>
  hasValue(fields.get('science'));

const COLOUR_CHANNELS = /R:\s*(\d+)\s+G:\s*(\d+)\s+B:\s*(\d+)/i;

const COLOUR_FORMATS = {
  colourHex: (rgb: number) => (rgb === 0 ? '0' : `0x${rgb.toString(16)}`),
  colourArgb: (rgb: number) => String((0xff000000 | rgb) >>> 0),
};

const colourOptions = async (
  { index, read }: SuggestionSources,
  format: (rgb: number) => string,
): Promise<SuggestionOption[]> => {
  const options: SuggestionOption[] = [];

  for (const { definition, fields } of await readDefinitionFields(index, 'MultiplayerColor', read)) {
    const channels = COLOUR_CHANNELS.exec(fields.get('rgbcolor') ?? '');

    if (channels) {
      const [red, green, blue] = channels.slice(1).map((each) => Math.min(Number(each), 255));

      options.push({
        value: format((red << 16) | (green << 8) | blue),
        label: `${definition.name} (${red}, ${green}, ${blue})`,
      });
    }
  }
  return options;
};

export const resolveSuggestions = async (
  kind: SuggestionKind,
  sources: SuggestionSources,
): Promise<SuggestionOption[]> => {
  const options = await (async () => {
    switch (kind) {
      case 'side':
        return sideOptions(await readSides(sources));
      case 'sideState':
        return sideStateOptions(await readSides(sources));
      case 'buttonImage':
        return buttonImageOptions(sources);
      case 'powerIcon':
        return buttonImageOptions(sources, isHeroPower);
      case 'spellImage':
        return buttonImageOptions(sources, isSpell);
      case 'classIcon':
        return readClassIcons(await sources.readHeroSystem());
      case 'typeIcon':
        return readTypeIcons(await sources.readHeroSystem());
      case 'heroImage':
        return readHeroImages(sources.index, sources.read, sources.composeObject);
      case 'unitPortrait':
        return readUnitPortraits(sources.index, sources.read);
      case 'colourHex':
      case 'colourArgb':
        return colourOptions(sources, COLOUR_FORMATS[kind]);
      default:
        return imageNameOptions(sources, IMAGE_NAME_PATTERNS[kind] ?? /$^/);
    }
  })();

  return options.slice(0, MAX_OPTIONS);
};
