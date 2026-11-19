import type { PlaySoundRequest, SoundReply } from '../../core/soundClip';
import type { ScriptTreeNode } from '../shared/scriptTreeText';

export type FromScriptsPage =
  | { kind: 'ready' }
  | PlaySoundRequest;

export type ToScriptsPage = ScriptsMessage | SoundReply;

export interface ScriptsMessage {
  kind: 'scripts';
  name: string | undefined;
  scripts: ScriptTreeNode[][];
  problems: string[];
}
