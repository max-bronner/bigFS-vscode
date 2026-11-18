export const createDebouncer = (action: () => void, wait: number) => {
  let handle: NodeJS.Timeout | undefined;

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
