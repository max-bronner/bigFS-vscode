export interface PlaySoundRequest {
  kind: 'playSound';
  name: string;
  id?: number;
  open?: boolean;
}

export interface SoundClip {
  file: string;
  mime: string;
  data: string;
}

export interface SoundReply {
  kind: 'sound';
  name: string;
  id?: number;
  clip?: SoundClip;
  error?: string;
}
