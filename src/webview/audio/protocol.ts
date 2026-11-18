export interface PlayMessage {
  kind: 'play';
  name: string;
  mime: string;
  data: string;
}

export type ToSoundPage = PlayMessage;

export type FromSoundPage = { kind: 'ready' };
