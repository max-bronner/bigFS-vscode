const DROP_SHADOW = '&dropshadow';

export const stripTextStyle = (text: string): string =>
  text.toLowerCase().endsWith(DROP_SHADOW)
    ? text.slice(0, text.length - DROP_SHADOW.length)
    : text;

export const textKey = (text: string): string | undefined => {
  const plain = stripTextStyle(text);

  return plain.startsWith('$') && plain.length > 1 ? plain : undefined;
};

export const resolveAptText = (
  text: string,
  find: (label: string) => string | undefined,
): string => {
  const key = textKey(text);

  if (!key) {
    return stripTextStyle(text);
  }

  const name = key.slice(1);

  return find(`APT:${name}`) ?? find(name) ?? `MISSING: 'APT:${name}'`;
};

export const collectTextKeys = (strings: Iterable<unknown>): string[] => {
  const keys = new Set<string>();

  for (const value of strings) {
    const key = typeof value === 'string' ? textKey(value) : undefined;

    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
};
