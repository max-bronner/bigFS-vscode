import type {
  MapScriptCall,
  MapScriptNode,
} from '../../formats/map/mapFile';

export interface SoundCall extends MapScriptCall {
  sounds?: number[];
}

export type ScriptTreeNode =
  | Extract<MapScriptNode, { kind: 'group' }>
  | (Omit<
      Extract<MapScriptNode, { kind: 'script' }>,
      'conditions' | 'actions' | 'actionsFalse'
    > & {
      conditions: SoundCall[][];
      actions: SoundCall[];
      actionsFalse: SoundCall[];
    });

export interface SideEntry {
  key: string;
  value: { value: boolean | number | string };
}

export const countScripts = (nodes: readonly ScriptTreeNode[]): number =>
  nodes.reduce(
    (sum, node) =>
      sum + (node.kind === 'group' ? countScripts(node.children as ScriptTreeNode[]) : 1),
    0,
  );

export const describeScript = (
  node: Extract<ScriptTreeNode, { kind: 'script' }>,
): string =>
  node.name +
  (node.oneShot ? ' · once' : '') +
  (node.subroutine ? ' · subroutine' : '') +
  (node.difficulties.length < 3 ? ` · ${node.difficulties.join('/')}` : '');

export const describePlayerList = (
  list: readonly ScriptTreeNode[],
  side: readonly SideEntry[] | undefined,
  slot: number,
  hasSides: boolean,
): string => {
  const owner = side?.find((entry) => entry.key === 'playerName');
  const name = owner?.value.value
    ? String(owner.value.value)
    : `${hasSides ? 'Player ' : 'Script list '}${slot + 1}`;

  return `${name} (${countScripts(list)})`;
};
