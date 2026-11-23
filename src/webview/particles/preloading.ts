import type { PreloadPlan } from '../../game/objects/listPreloads';
import { listNearbyAppearances } from './appearancePanel';
import { getDetail } from './detailLevel';
import {
  findClip,
  findModel,
  getHeldBytes,
  getLookKey,
  isLoading,
  loadClip,
  loadModel,
  onStoreChanged,
} from './modelStore';
import { post } from './page';

const PLAN_DELAY = 250;
const REST_AFTER_INPUT = 350;
const NEXT_DELAY = 30;
const MAX_PRELOADED_BYTES = 384 * 1024 * 1024;

const queue = {
  plan: { models: [], animations: [] } as PreloadPlan,
  planTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  nextTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  lastInput: 0,
};

export const planPreload = (): void => {
  clearTimeout(queue.planTimer);
  queue.planTimer = setTimeout(
    () => post({ kind: 'planPreload', choices: listNearbyAppearances() }),
    PLAN_DELAY,
  );
};

const loadNext = () => {
  if (isLoading()) {
    return;
  }

  const rest = queue.lastInput + REST_AFTER_INPUT - performance.now();

  if (rest > 0) {
    schedule(rest);
    return;
  }

  const clip = queue.plan.animations.find((name) => findClip(name) === undefined);

  if (clip) {
    loadClip(clip);
    return;
  }
  if (getHeldBytes() >= MAX_PRELOADED_BYTES) {
    return;
  }
  for (const { name, textures, hasDetailModels } of queue.plan.models) {
    const look = { name, textures, detail: getDetail(hasDetailModels) };

    if (findModel(getLookKey(look)) === undefined) {
      loadModel(look);
      return;
    }
  }
};

const schedule = (wait = NEXT_DELAY) => {
  clearTimeout(queue.nextTimer);
  queue.nextTimer = setTimeout(loadNext, wait);
};

export const receivePreloadPlan = (plan: PreloadPlan): void => {
  queue.plan = plan;
  schedule();
};

for (const kind of ['pointerdown', 'keydown', 'wheel'] as const) {
  window.addEventListener(
    kind,
    () => {
      queue.lastInput = performance.now();
    },
    { capture: true, passive: true },
  );
}
onStoreChanged(() => schedule());
