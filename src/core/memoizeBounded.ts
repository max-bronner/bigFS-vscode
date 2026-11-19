export const memoizeBounded = <Result>(
  compute: (key: string) => Result,
  limit: number,
): ((key: string) => Result) => {
  let answers = new Map<string, Result>();

  return (key) => {
    const known = answers.get(key);

    if (known !== undefined) {
      return known;
    }

    if (answers.size >= limit) {
      answers = new Map();
    }

    const computed = compute(key);

    answers.set(key, computed);

    return computed;
  };
};
