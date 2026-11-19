import type { Uri } from 'vscode';
import type { SuggestionOption } from '../../game/apt/suggestionKinds';
import type { HeroSystem } from '../../game/objects/cahSystem';
import { readDefinitionFields, readFields } from './aptDefinitionFields';
import type { DefinitionFields, ReadText, SuggestionIndex } from './aptDefinitionFields';

const MAX_COMPOSED = 200;

export type ComposeObject = (uri: Uri, line: number) => Promise<string | undefined>;

const INHERITING = /^(childobject|objectreskin)$/i;

const namesHero = (kindOf: string): boolean => /(^|\s)HERO(\s|$)/i.test(kindOf);

const replacesKinds = (kindOf: string): boolean => !/(^|\s)[+-]/.test(kindOf);

const collect = (
  found: Map<string, { value: string; objects: string[] }>,
  value: string | undefined,
  object: string,
): void => {
  if (value && !/^none$/i.test(value)) {
    const entry = found.get(value.toLowerCase()) ?? { value, objects: [] };

    entry.objects.push(object);
    found.set(value.toLowerCase(), entry);
  }
};

const toOptions = (
  found: Map<string, { value: string; objects: string[] }>,
): SuggestionOption[] =>
  [...found.values()]
    .sort((a, b) => a.value.localeCompare(b.value))
    .map(({ value, objects }) => ({
      value,
      label: objects.slice(0, 3).join(', '),
    }));

export const readUnitPortraits = async (
  index: SuggestionIndex,
  read: ReadText,
): Promise<SuggestionOption[]> => {
  const found = new Map<string, { value: string; objects: string[] }>();

  for (const { definition, fields } of await readDefinitionFields(index, 'Object', read)) {
    collect(found, fields.get('selectportrait'), definition.name);
  }
  return toOptions(found);
};

const needsParents = ({ definition, fields }: DefinitionFields): boolean => {
  const kindOf = fields.get('kindof');
  const hasImage = fields.has('buttonimage');

  if (!INHERITING.test(definition.keyword)) {
    return false;
  }
  if (kindOf !== undefined && replacesKinds(kindOf)) {
    return namesHero(kindOf) && !hasImage;
  }
  return hasImage || kindOf !== undefined;
};

export const readHeroImages = async (
  index: SuggestionIndex,
  read: ReadText,
  compose: ComposeObject,
): Promise<SuggestionOption[]> => {
  const found = new Map<string, { value: string; objects: string[] }>();
  let composed = 0;

  for (const object of await readDefinitionFields(index, 'Object', read)) {
    const { definition } = object;
    let fields = object.fields;

    if (needsParents(object) && composed < MAX_COMPOSED) {
      composed++;

      const text = await compose(definition.uri, definition.line).catch(() => undefined);

      fields = text ? readFields(text.split(/\r?\n/)) : fields;
    }

    const kindOf = fields.get('kindof');

    if (kindOf && replacesKinds(kindOf) && namesHero(kindOf)) {
      collect(found, fields.get('buttonimage'), definition.name);
    }
  }
  return toOptions(found);
};

const iconOptions = (
  icons: readonly { image?: string; label: string }[],
): SuggestionOption[] =>
  icons.flatMap(({ image, label }) => (image ? [{ value: image, label }] : []));

export const readClassIcons = (system: HeroSystem | undefined): SuggestionOption[] =>
  iconOptions(
    (system?.classes ?? []).map((each, at) => ({
      image: each.iconImage,
      label: `class ${at}${each.nameTag ? `: ${each.nameTag}` : ''}`,
    })),
  );

export const readTypeIcons = (system: HeroSystem | undefined): SuggestionOption[] =>
  iconOptions(
    (system?.classes ?? []).flatMap((each, at) =>
      each.subclasses.map((sub, subAt) => ({
        image: sub.iconImage,
        label: `class ${at} type ${subAt}${sub.nameTag ? `: ${sub.nameTag}` : ''}`,
      })),
    ),
  );
