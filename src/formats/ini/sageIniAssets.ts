import type { SageBlock, SageDocument } from './sageIniParser';

export type AssetKind = 'model' | 'animation' | 'texture' | 'sound';

export interface AssetReference {
  kind: AssetKind;
  name: string;
  line: number;
  start: number;
  end: number;
  candidates: string[];
}

const TEXTURE_EXTENSIONS = ['dds', 'tga', 'jpg', 'png'];
const SOUND_EXTENSIONS = ['wav', 'mp3'];
const STREAMED = /^(dialogevent|musictrack|ambientstream|streamedsound)$/i;

const NOT_A_FILE = /^(none|#.*|\$.*|.*[()#].*)$/i;

const stemOf = (name: string) => name.replace(/\.[^.\\/]*$/, '');
const baseOf = (name: string) => name.slice(name.search(/[^\\/]*$/));
const lower = (name: string) => name.toLowerCase();

const topBlockAt = (blocks: SageBlock[], line: number): SageBlock | undefined =>
  blocks.find((block) => block.startLine <= line && line <= block.endLine);

export const getTextureCandidates = (name: string): string[] => {
  const stem = lower(stemOf(baseOf(name)));

  return TEXTURE_EXTENSIONS.map((extension) => `${stem}.${extension}`);
};

export const getSoundUseName = (reference: AssetReference): string =>
  reference.candidates.length > 1
    ? stemOf(reference.candidates[0])
    : reference.candidates[0];

export const getFileUseNames = (fileName: string): string[] => {
  const name = lower(baseOf(fileName));

  return SOUND_EXTENSIONS.some((extension) => name.endsWith(`.${extension}`))
    ? [stemOf(name), name]
    : [name];
};

export const findAssetReferences = (parsed: SageDocument): AssetReference[] => {
  const references: AssetReference[] = [];

  for (const statement of parsed.statements) {
    if (statement.kind !== 'field' || !statement.values.length) {
      continue;
    }

    const key = lower(statement.keyword.text);
    const first = statement.values[0];
    const add = (
      kind: AssetKind,
      token: { text: string; start: number; end: number },
      candidates: string[],
      name = token.text,
    ) => {
      if (!NOT_A_FILE.test(name)) {
        references.push({
          kind,
          name,
          line: statement.line,
          start: token.start,
          end: token.end,
          candidates,
        });
      }
    };

    switch (key) {
      case 'model':
      case 'modelname':
        add('model', first, [`${lower(stemOf(baseOf(first.text)))}.w3d`]);
        break;
      case 'animationname':
      case 'animation': {
        const clip = first.text.slice(first.text.lastIndexOf('.') + 1);

        if (clip) {
          add('animation', first, [`${lower(clip)}.w3d`]);
        }
        break;
      }
      case 'particlename':
        add(
          /\.w3d$/i.test(first.text) ? 'model' : 'texture',
          first,
          /\.w3d$/i.test(first.text)
            ? [lower(baseOf(first.text))]
            : getTextureCandidates(first.text),
        );
        break;
      case 'texture':
        add('texture', first, getTextureCandidates(first.text));
        break;
      case 'sounds':
      case 'soundsmorning':
      case 'soundsevening':
      case 'soundsnight':
      case 'attack':
      case 'decay': {
        if (
          !/^audioevent$/i.test(
            topBlockAt(parsed.blocks, statement.line)?.keyword ?? '',
          )
        ) {
          break;
        }
        for (const token of statement.values) {
          const name = token.text.replace(/:\d+$/, '');

          add(
            'sound',
            { ...token, end: token.start + name.length },
            SOUND_EXTENSIONS.map(
              (extension) => `${lower(baseOf(name))}.${extension}`,
            ),
            name,
          );
        }
        break;
      }
      case 'filename': {
        const block = topBlockAt(parsed.blocks, statement.line);

        if (block && STREAMED.test(block.keyword)) {
          const file = lower(baseOf(first.text));

          add(
            'sound',
            first,
            /\.[a-z0-9]+$/.test(file)
              ? [file]
              : SOUND_EXTENSIONS.map((extension) => `${file}.${extension}`),
          );
        }
        break;
      }
    }
  }
  return references;
};

const KIND_LABELS: Record<AssetKind, string> = {
  model: 'Model',
  animation: 'Animation',
  texture: 'Texture',
  sound: 'Sound',
};

export const formatMissingAssetMessage = (
  reference: AssetReference,
  suggestions: string[],
): string =>
  `${KIND_LABELS[reference.kind]} '${reference.name}' has no ${reference.candidates
    .slice(0, 2)
    .join(
      ' or ',
    )}${reference.candidates.length > 2 ? ' (or another texture format)' : ''} in any archive or folder` +
  (suggestions.length
    ? `; did you mean ${suggestions.map((name) => `'${name}'`).join(', ')}?`
    : '');

export const parseSuggestedAssetNames = (message: string): string[] => {
  const tail = /did you mean (.*)\?$/.exec(message)?.[1] ?? '';

  return [...tail.matchAll(/'([^']*)'/g)].map((match) => match[1]);
};

export const isMissingAssetMessage = (message: string): boolean =>
  /^(Model|Animation|Texture|Sound) '.*' has no /.test(message);
