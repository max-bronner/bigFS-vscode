export interface CommandErrorSink {
  showError: (message: string) => void;
  logError?: (id: string, error: unknown) => void;
}

export const guardCommand = <Args extends unknown[], Result>(
  id: string,
  handler: (...args: Args) => Result,
  sink: () => CommandErrorSink,
  describe: (error: unknown) => string,
): ((...args: Args) => Result | undefined) => {
  const report = (error: unknown): undefined => {
    const { showError, logError } = sink();

    logError?.(id, error);
    showError(describe(error));
    return undefined;
  };

  return (...args) => {
    try {
      const result = handler(...args);

      return result instanceof Promise
        ? (result.catch(report) as Result)
        : result;
    } catch (error) {
      return report(error);
    }
  };
};
