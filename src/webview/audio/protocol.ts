import type { PlaySoundRequest, SoundReply } from '../../core/soundClip';

export type ToSoundPage = SoundReply;

export type FromSoundPage = { kind: 'ready' } | PlaySoundRequest;
