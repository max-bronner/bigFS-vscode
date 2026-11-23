export interface ClipRequests {
  ask(name: string): void;
  receive(name: string, wanted: string | undefined): boolean;
}

export const createClipRequests = (post: (name: string) => void): ClipRequests => {
  const awaited = new Set<string>();

  return {
    ask: (name) => {
      if (!awaited.has(name)) {
        awaited.add(name);
        post(name);
      }
    },
    receive: (name, wanted) => {
      awaited.delete(name);
      return name === wanted;
    },
  };
};
