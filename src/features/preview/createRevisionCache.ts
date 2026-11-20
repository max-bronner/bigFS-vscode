export interface RevisionCache<T> {
  get(key: string, compute: () => T): T;
}

export const createRevisionCache = <T>(
  getRevision: () => number,
): RevisionCache<T> => {
  const values = new Map<string, T>();
  let revision = getRevision();

  return {
    get: (key, compute) => {
      if (revision !== getRevision()) {
        revision = getRevision();
        values.clear();
      }
      if (!values.has(key)) {
        values.set(key, compute());
      }
      return values.get(key) as T;
    },
  };
};
