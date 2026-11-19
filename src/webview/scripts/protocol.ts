import type { PlaySoundRequest } from '../../core/soundClip';
import type { ScriptTreeNode } from '../shared/scriptTreeText';

export type FromScriptsPage =
  | { kind: 'ready' }
  | PlaySoundRequest;

export interface ScriptsMessage {
  kind: 'scripts';
  name: string | undefined;
  scripts: ScriptTreeNode[][];
  problems: string[];
}
