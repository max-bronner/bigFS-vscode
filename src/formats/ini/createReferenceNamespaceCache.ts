type ResolveNamespaces = (
  field: string,
  context?: string,
  tokenIndex?: number,
) => readonly string[];

const CACHE_LIMIT = 20_000;

export const createReferenceNamespaceCache = (
  resolve: ResolveNamespaces,
): ResolveNamespaces => {
  let byContext = new Map<
    string | undefined,
    Map<string, Map<number | undefined, readonly string[]>>
  >();
  let size = 0;

  return (field, context, tokenIndex) => {
    const byField = byContext.get(context) ?? new Map();
    const byToken = byField.get(field) ?? new Map();
    const known = byToken.get(tokenIndex);

    if (known) {
      return known;
    }

    if (size >= CACHE_LIMIT) {
      byContext = new Map();
      size = 0;

      return resolve(field, context, tokenIndex);
    }

    const answer = resolve(field, context, tokenIndex);

    byToken.set(tokenIndex, answer);
    byField.set(field, byToken);
    byContext.set(context, byField);
    size += 1;

    return answer;
  };
};
