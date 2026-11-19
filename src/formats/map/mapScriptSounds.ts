import type { MapScriptNode } from './mapFile';

const SOUND_FIRST_PARAMETER: ReadonlySet<string> = new Set([
  'play_sound_effect',
  'play_sound_effect_at',
  'play_sound_effect_at_team',
  'sound_play_named',
  'speech_play',
  'music_play_track_finite_times',
  'music_play_track_finite_times_and_notify',
  'audio_push_music',
  'audio_make_sound_immune_to_fade',
  'audio_make_sound_subject_to_fade',
  'sound_disable_type',
  'sound_enable_type',
  'has_finished_audio',
]);

const normal = (name: string) => name.toLowerCase();

export const findSoundParameterIndexes = (
  name: string,
  parameters: readonly string[],
): number[] =>
  SOUND_FIRST_PARAMETER.has(normal(name)) && parameters[0]?.trim() ? [0] : [];

export const withSoundParameters = <
  T extends { name: string; parameters: string[] },
>(
  call: T,
): T & { sounds: number[] } => ({
  ...call,
  sounds: findSoundParameterIndexes(call.name, call.parameters),
});

export const markSounds = (nodes: MapScriptNode[]): MapScriptNode[] =>
  nodes.map((node) =>
    node.kind === 'group'
      ? { ...node, children: markSounds(node.children) }
      : {
          ...node,
          conditions: node.conditions.map((and) =>
            and.map(withSoundParameters),
          ),
          actions: node.actions.map(withSoundParameters),
          actionsFalse: node.actionsFalse.map(withSoundParameters),
        },
  );
