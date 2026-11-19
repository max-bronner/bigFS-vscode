export const createDebouncer = (action: () => void, wait: number) => {
  let handle: ReturnType<typeof setTimeout> | undefined;

  const cancel = (): void => {
    if (handle) {
      clearTimeout(handle);
      handle = undefined;
    }
  };

  const schedule = (): void => {
    cancel();
    handle = setTimeout(() => {
      handle = undefined;
      action();
    }, wait);
  };

  return { schedule, cancel, isPending: () => handle !== undefined };
};

export const createKeyedDebouncer = <T>(
  action: (item: T) => void,
  wait: number,
  getKey: (item: T) => string,
) => {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (key: string): void => {
    clearTimeout(pending.get(key));
    pending.delete(key);
  };

  const schedule = (item: T): void => {
    const key = getKey(item);

    cancel(key);
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        action(item);
      }, wait),
    );
  };

  const dispose = (): void => [...pending.keys()].forEach(cancel);

  return { schedule, cancel, dispose };
};
