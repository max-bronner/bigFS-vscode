import { describeCondition, describeOccasion } from './objectEffects';
import { readStateConditions } from './objectScene';
import type { ObjectScene, SceneState } from './objectScene';

export interface ListedEffect {
  kind: 'fxList' | 'system';
  name: string;
  bone?: string;
  frame?: number;
  detail: string;
  part?: string;
}

export interface StateEffects {
  playing: ListedEffect[];
  others: { title: string; effects: ListedEffect[] }[];
}

export const listStateEffects = (
  scene: ObjectScene,
  worn: SceneState | undefined,
  playing: SceneState | undefined,
  held: readonly string[],
): StateEffects => {
  const shown = [...new Set([worn, playing])].flatMap((state) => state ?? []);
  const conditions = new Set([...held, ...shown.flatMap(readStateConditions)]);
  const now: ListedEffect[] = shown.flatMap((state) => {
    const from = state === worn ? 'the model' : 'the animation';

    return [
      ...state.particles.map(
        (each): ListedEffect => ({
          kind: 'system',
          name: each.system,
          bone: each.bone,
          detail: `${/^none$/i.test(each.bone) ? 'at the origin' : `on ${each.bone}`}, with ${from}`,
        }),
      ),
      ...state.fx.map(
        (name): ListedEffect => ({ kind: 'fxList', name, detail: `as ${from} starts` }),
      ),
      ...(state.fxEvents ?? []).map(
        ({ name, frame }): ListedEffect => ({
          kind: 'fxList',
          name,
          frame,
          detail: `at frame ${frame} of ${from}`,
        }),
      ),
    ];
  });
  const others = new Map<string, ListedEffect[]>();

  for (const effect of scene.fx) {
    const { name, bone, phase, field } = effect;
    const matched = effect.when?.find((condition) => conditions.has(condition));
    const listed: ListedEffect = {
      kind: effect.isSystem ? 'system' : 'fxList',
      name,
      ...(bone ? { bone } : {}),
      detail: [matched ? describeCondition(matched) : field, phase?.toLowerCase()]
        .filter(Boolean)
        .join(', '),
    };

    if (matched) {
      now.push(listed);
    } else {
      const title = describeOccasion(effect);

      others.set(title, [...(others.get(title) ?? []), listed]);
    }
  }

  return {
    playing: now,
    others: [...others].map(([title, effects]) => ({ title, effects })),
  };
};
