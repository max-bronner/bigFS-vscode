export interface FrameRequests {
  want(index: number): void;
  settle(): void;
}

export const createFrameRequests = (
  send: (index: number) => void,
): FrameRequests => {
  let inFlight = false;
  let waiting: number | undefined;
  const flush = () => {
    if (inFlight || waiting === undefined) {
      return;
    }

    const index = waiting;

    waiting = undefined;
    inFlight = true;
    send(index);
  };

  return {
    want: (index) => {
      waiting = index;
      flush();
    },
    settle: () => {
      inFlight = false;
      flush();
    },
  };
};
