import type { ScriptTreeNode } from '../shared/scriptTreeText';

export type FromScriptsPage =
  | { kind: 'ready' }
  | { kind: 'playSound'; name: string };

export interface ScriptsMessage {
  kind: 'scripts';
  name: string | undefined;
  scripts: ScriptTreeNode[][];
  problems: string[];
}
