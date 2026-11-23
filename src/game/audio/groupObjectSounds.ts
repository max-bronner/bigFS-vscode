export interface ObjectSound {
  field: string;
  name: string;
  module?: string;
}

export interface LabelledSound extends ObjectSound {
  label: string;
}

export interface SoundGroup {
  title: string;
  sounds: LabelledSound[];
}

const OCCASIONS: readonly [string, RegExp][] = [
  ['Announcer', /^eva|evaevent|announcement/],
  ['Selected', /^voiceselect/],
  [
    'Ordered to attack',
    /^voice(enterstate)?(attack|desperateattack|startcharging)/,
  ],
  [
    'Ordered to move',
    /^voice(enterstate)?(move|retreat|combinewithhorde)/,
  ],
  [
    'Ordered to guard, garrison or enter',
    /^voice(enterstate)?(guard|garrison|deliverring|enter|initiatecapture)/,
  ],
  [
    'Abilities and weapon switches',
    /^voice(enterstate)?(specialability|special|initiate|primaryweapon|secondaryweapon|extinguish)/,
  ],
  [
    'Created, built or promoted',
    /^(voice|sound)(created|fullycreated|build|nobuild|repair|supply|taskcomplete|upgrade|promoted)/,
  ],
  ['Reactions', /^voice(fear|gethealed|alert|defect)|^soundstealth/],
  [
    'Hurt, hit or dying',
    /^sound(on.*damaged|impact|falling|ondestroyed|die|death)|death|^die/,
  ],
  [
    'Moving, gates and deploying',
    /^sound(move|crushing|openinggate|closinggate|finished.*gate|deploy|undeploy|enter$|exit$)/,
  ],
  ['Ambient', /^soundambient/],
];

const BARE_FIELD = /^(sound|soundtoplay|soundstate)$/;
const DEATH_MODULE = /death|die|collapse|topple/i;

const LISTED = [
  'Selected',
  'Ordered to move',
  'Ordered to attack',
  'Ordered to guard, garrison or enter',
  'Abilities and weapon switches',
  'Created, built or promoted',
  'Reactions',
  'Hurt, hit or dying',
  'Moving, gates and deploying',
  'Ambient',
  'Announcer',
  'Other',
];

export const describeSoundField = (field: string): string => {
  const startsState = /^VoiceEnterState(?=.)/i.test(field);
  const core = field
    .replace(/^VoiceEnterState(?=.)/i, '')
    .replace(/^(Voice|Sound|EvaEvent)(?=[A-Z])/, '');
  const words = core
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();
  const sentence = words.charAt(0).toUpperCase() + words.slice(1);

  return startsState ? `${sentence}, as it starts` : sentence;
};

export const groupObjectSounds = (sounds: readonly ObjectSound[]): SoundGroup[] => {
  const groups = new Map<string, LabelledSound[]>(LISTED.map((title) => [title, []]));

  for (const sound of sounds) {
    const key = sound.field.toLowerCase();
    const module = BARE_FIELD.test(key) ? sound.module : undefined;
    const title =
      module && DEATH_MODULE.test(module)
        ? 'Hurt, hit or dying'
        : (OCCASIONS.find(([, fields]) => fields.test(key))?.[0] ?? 'Other');
    const label = module ? describeSoundField(module) : describeSoundField(sound.field);

    groups.get(title)!.push({ ...sound, label });
  }
  return [...groups].flatMap(([title, listed]) =>
    listed.length
      ? [{ title, sounds: listed.sort((a, b) => a.label.localeCompare(b.label)) }]
      : [],
  );
};
