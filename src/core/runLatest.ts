export const runLatest = (action: () => Promise<void>): (() => Promise<void>) => {
  let running: Promise<void> | undefined;
  let following: Promise<void> | undefined;

  const start = (): Promise<void> => {
    const current = action().finally(() => {
      running = undefined;
    });

    running = current;
    return current;
  };

  return () => {
    if (!running) {
      return start();
    }

    following ??= running
      .catch(() => undefined)
      .then(() => {
        following = undefined;
        return start();
      });
    return following;
  };
};
