import { memoizeBounded } from '../../core/memoizeBounded';

const CONTEXT_MEMO_LIMIT = 4096;

export const AUDIO_NAMESPACES = [
  'AudioEvent',
  'DialogEvent',
  'MusicTrack',
  'AmbientStream',
  'StreamedSound',
  'Multisound',
] as const;

export const EVA_NAMESPACES = ['NewEvaEvent', 'PredefinedEvaEvent'] as const;

export type AudioReferenceKind = 'audio' | 'eva';

export const getKindNamespaces = (
  kind: AudioReferenceKind,
): readonly string[] => (kind === 'audio' ? AUDIO_NAMESPACES : EVA_NAMESPACES);

const AUDIO_NAMESPACE_KEYS: ReadonlySet<string> = new Set(
  [...AUDIO_NAMESPACES, ...EVA_NAMESPACES].map((name) => name.toLowerCase()),
);

export const isAudioNamespace = (namespace: string): boolean =>
  AUDIO_NAMESPACE_KEYS.has(namespace.toLowerCase());

const NOT_A_NAME_FIELDS: ReadonlySet<string> = new Set([
  'filename',
  'voicepriority',
  'voiceattackchargetimeout',
  'voicemovetocampmaxcampnessatstartpoint',
  'voicemovetocampmincampnessatendpoint',
]);

const NUMBER_SUFFIX = /(?:scanrange|timeoutms|looptime|percent)$/;

const NAMES_A_KEY = /^unitspecificsound(?:name)?touseas/;

const EVA_FIELD =
  /^(?:evaevent|evaenemy|evaonfirstsighting|announcementevent)|evaevent$/;

const NOT_EVA_FIELDS: ReadonlySet<string> = new Set([
  'shouldplayunderattackevaevent',
  'suppressevaeventforremoval',
  'useslaverascontrolforevaobjectsightedevents',
  'otherevaeventstoblock',
]);

const AUDIO_FIELD_PREFIX = /^(?:voice|sound(?!s|state$|upgrade$))/;

const AUDIO_FIELDS: ReadonlySet<string> = new Set([
  'firesound',
  'overridevoiceattacksound',
  'overridevoiceenterstateattacksound',
  'researchsound',
  'unitspecificsound',
  'setautoabilityunitsound',
  'unsetautoabilityunitsound',
  'initiatesound',
  'initiateatlocationsound',
  'packsound',
  'unpacksound',
  'prepsoundloop',
  'activeloopsound',
  'triggersound',
  'soundtoplay',
  'pingsound',
  'loudpingsound',
  'discoveredsound',
  'initiatevoice',
  'entersound',
  'exitsound',
  'beingbuiltsound',
  'selfbuildingloop',
  'selfrepairfromdamageloop',
  'selfrepairfromrubbleloop',
  'burningsoundname',
  'speedbonusaudioloop',
  'totalcrushsound',
  'backendcrushsound',
  'frontendcrushsound',
  'damagedtosound',
  'repairedtosound',
  'suppliesdepletedvoice',
  'lightpointsupsound',
  'bombardmentplanpacksoundname',
  'bombardmentplanunpacksoundname',
  'holdthelineplanpacksoundname',
  'holdthelineplanunpacksoundname',
  'searchanddestroyplanpacksoundname',
  'searchanddestroyplanunpacksoundname',
  'searchanddestroyplanidleloopsoundname',
  'bombardmentannouncementname',
  'holdthelineannouncementname',
  'searchanddestroyannouncementname',
  'onselectedsound',
  'onmoveplannedsound',
  'onmovestartedsound',
  'welcomereinforcementssound',
  'kickoutreinforcementssound',
  'disbandunitsound',
  'onbuildingdestroyedsound',
  'onconstructionbegunsound',
  'onconstructionfinishedsound',
  'battlemarkercreatedsound',
  'entermapsound',
  'animrayscreatesound',
  'regionconqueredsound',
  'loadscreenmusic',
  'loadscreenmusictrack',
  'objectiveaddedsound',
  'objectivecompletedsound',
  'basictutorialloadscreenmusictrack',
  'basictutorialloadscreenvoicetrack',
  'advancedtutorialloadscreenmusictrack',
  'advancedtutorialloadscreenvoicetrack',
  'skirmishmusictrack',
  'skirmishvoicetrack',
  'openaudio',
  'weathersound',
]);

const SCOPED_AUDIO_FIELDS: Record<string, readonly string[] | '*'> = {
  unitspecificsounds: '*',
  miscaudio: '*',
  multisound: ['subsounds'],
  sidesound: ['sound'],
  sound: ['name', 'sound', 'duck'],
  largegroupaudiomap: ['sound'],
  livingworldsound: ['sound'],
  livingworldplayertemplate: ['music', 'autoresolveloop'],
  act: ['audioevent'],
  session: ['audio'],
  slowdeathbehavior: ['sound'],
  clearancetestingslowdeathbehavior: ['sound'],
  giantbirdslowdeathbehavior: ['sound'],
  shipslowdeathbehavior: ['sound'],
  instantdeathbehavior: ['sound'],
  modelconditionaudioloopclientbehavior: ['modelcondition'],
  animationsoundclientbehavior: ['animationsound'],
};

export const getLastContextSegment = memoizeBounded(
  (contextName: string): string =>
    contextName.split('>').pop()?.trim().toLowerCase() ?? '',
  CONTEXT_MEMO_LIMIT,
);

export const getAudioReferenceKind = (
  contextName: string,
  field: string,
): AudioReferenceKind | undefined => {
  const name = field.toLowerCase();

  if (NOT_A_NAME_FIELDS.has(name) || NAMES_A_KEY.test(name)) {
    return undefined;
  }

  const scoped = SCOPED_AUDIO_FIELDS[getLastContextSegment(contextName)];

  if (scoped === '*' || scoped?.includes(name)) {
    return 'audio';
  }

  if (EVA_FIELD.test(name)) {
    return NUMBER_SUFFIX.test(name) || NOT_EVA_FIELDS.has(name)
      ? undefined
      : 'eva';
  }

  return AUDIO_FIELDS.has(name) ||
    (AUDIO_FIELD_PREFIX.test(name) && !NUMBER_SUFFIX.test(name))
    ? 'audio'
    : undefined;
};
