const MAX_SCRIPTS = 1000;

export const SCRIPT_PRIORITY = { initialize: 0, construct: 1, normal: 2 };

export interface ScriptQueue {
  add(script: () => void, priority?: number): void;
  drain(): void;
  hold<Result>(queue: () => Result): Result;
}

export const createScriptQueue = (
  isBlocked: () => boolean,
  onOverflow: (limit: number) => void,
): ScriptQueue => {
  const buckets: (() => void)[][] = [[], [], []];
  let isHeld = false;

  const takeNext = () => buckets.find((bucket) => bucket.length)?.shift();

  const runWaiting = () => {
    for (let ran = 0; ; ran++) {
      const script = takeNext();

      if (!script) {
        return;
      }
      if (ran >= MAX_SCRIPTS) {
        onOverflow(MAX_SCRIPTS);
        buckets.forEach((bucket) => (bucket.length = 0));
        return;
      }
      script();
    }
  };

  const hold = <Result>(queue: () => Result): Result => {
    const wasHeld = isHeld;

    isHeld = true;
    try {
      return queue();
    } finally {
      isHeld = wasHeld;
    }
  };

  const drain = () => {
    if (!isHeld && !isBlocked()) {
      hold(runWaiting);
    }
  };

  return {
    add: (script, priority = SCRIPT_PRIORITY.normal) =>
      void buckets[priority].push(script),
    drain,
    hold,
  };
};
