export const updateAtFirstTarget = async <Target>(
  update: (target: Target) => PromiseLike<void>,
  targets: readonly Target[],
): Promise<void> => {
  let failure: unknown;

  for (const target of targets) {
    try {
      await update(target);
      return;
    } catch (error) {
      failure = error;
    }
  }

  throw failure;
};
