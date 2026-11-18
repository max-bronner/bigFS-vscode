export const createNonce = (): string =>
  Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');
