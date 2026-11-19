import type { SubObjectRule } from '../../formats/w3d/w3dScene';
import { findIdleState } from './objectScene';
import type {
  BodyDamageState,
  ObjectScene,
  SceneState,
  SceneUpgrade,
} from './objectScene';
import type { ScriptedRule } from './subObjectScripts';

const DAMAGE_CONDITIONS: readonly [RegExp, BodyDamageState][] = [
  [/\bRUBBLE\b/i, 'rubble'],
  [/\bREALLYDAMAGED\b/i, 'reallydamaged'],
  [/\bDAMAGED\b/i, 'damaged'],
];

const findScriptState = (
  scene: ObjectScene,
  state: SceneState,
): SceneState | undefined =>
  state.kind === 'animation' ? state : findIdleState(scene, state.draw);

const markPermanent = (rules: readonly SubObjectRule[]): ScriptedRule[] =>
  rules.map((rule) => ({ ...rule, isPermanent: true }));

const listDamageWrites = (scene: ObjectScene, state: BodyDamageState) => {
  const rules = scene.damageSubObjects[state];

  return markPermanent([
    ...rules.filter((rule) => rule.hide),
    ...rules.filter((rule) => !rule.hide),
  ]);
};

const listUpgradeWrites = ({ triggers, hides, shows }: SceneUpgrade) => {
  const source = `upgrade ${triggers.join(' or ')}`.trim();

  return markPermanent([
    ...hides.map((pattern) => ({ pattern, hide: true, source })),
    ...shows.map((pattern) => ({ pattern, hide: false, source })),
  ]);
};

const listCreatedWrites = (scene: ObjectScene): ScriptedRule[] => {
  const { rules, grantedUpgrades } = scene.created;
  const listGrantedAt = (at: number) =>
    grantedUpgrades
      .filter((upgrade) => upgrade.at === at)
      .flatMap(({ name }) =>
        scene.upgrades
          .filter(({ triggers }) =>
            triggers.some((each) => each.toLowerCase() === name.toLowerCase()),
          )
          .flatMap(listUpgradeWrites),
      );

  return [
    ...rules.flatMap((rule, at) => [...listGrantedAt(at), rule]),
    ...listGrantedAt(rules.length),
  ];
};

const keepOneWritePerName = (writes: readonly SubObjectRule[]) => [
  ...new Map(writes.map((write) => [write.pattern.toLowerCase(), write])).values(),
];

const dropsPlainWrites = (state: SceneState, idle: SceneState | undefined) =>
  !state.retainsSubObjects &&
  state.model?.toLowerCase() !== (idle ?? state).model?.toLowerCase();

const findDamageState = (state: SceneState | undefined) =>
  DAMAGE_CONDITIONS.find(([condition]) => state && condition.test(state.label))?.[1];

export const listSubObjectRules = (
  scene: ObjectScene,
  state: SceneState | undefined,
): SubObjectRule[] => {
  const scripted = state && findScriptState(scene, state);
  const idle = state && findIdleState(scene, state.draw);
  const calls = [
    ...(idle && idle !== scripted ? idle.subObjects.rules : []),
    ...(scripted?.subObjects.rules ?? []),
  ];
  const created = listCreatedWrites(scene);
  const damage = findDamageState(state);

  return [
    ...keepOneWritePerName(
      [...(state && dropsPlainWrites(state, idle) ? [] : created), ...calls].filter(
        (rule) => !rule.isPermanent,
      ),
    ),
    ...keepOneWritePerName([
      ...listDamageWrites(scene, 'pristine'),
      ...scene.upgrades
        .filter((upgrade) => upgrade.startsActive)
        .flatMap(listUpgradeWrites),
      ...created.filter((rule) => rule.isPermanent),
      ...(damage ? listDamageWrites(scene, damage) : []),
      ...calls.filter((rule) => rule.isPermanent),
    ]),
  ];
};

export const listConditionalSubObjects = (
  scene: ObjectScene,
  state: SceneState | undefined,
): string[] => {
  const scripted = state && findScriptState(scene, state);
  const idle = state && findIdleState(scene, state.draw);

  return [
    ...new Set([
      ...(idle?.subObjects.conditional ?? []),
      ...(scripted?.subObjects.conditional ?? []),
      ...scene.created.conditional,
    ]),
  ];
};
