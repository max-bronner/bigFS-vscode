export interface RequestSequence {
  begin(): () => boolean;
}

export const createRequestSequence = (): RequestSequence => {
  let latest = 0;

  return {
    begin: () => {
      const mine = ++latest;

      return () => mine === latest;
    },
  };
};
