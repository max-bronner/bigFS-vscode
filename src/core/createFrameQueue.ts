export interface FrameQueue<T> {
  push(items: readonly T[]): void;
  clear(): void;
  readonly size: number;
}

export interface FrameQueueOptions<T> {
  render: (item: T) => void;
  budgetMilliseconds: number;
  requestFrame: (callback: () => void) => void;
  now: () => number;
}

export const createFrameQueue = <T>({
  render,
  budgetMilliseconds,
  requestFrame,
  now,
}: FrameQueueOptions<T>): FrameQueue<T> => {
  let waiting: T[] = [];
  let next = 0;
  let isFrameDue = false;

  const drawFrame = (): void => {
    isFrameDue = false;

    const started = now();

    while (next < waiting.length) {
      render(waiting[next]);
      next += 1;

      if (now() - started >= budgetMilliseconds) {
        break;
      }
    }

    if (next < waiting.length) {
      isFrameDue = true;
      requestFrame(drawFrame);
    } else {
      waiting = [];
      next = 0;
    }
  };

  return {
    push(items) {
      waiting.push(...items);

      if (!isFrameDue && waiting.length > next) {
        isFrameDue = true;
        requestFrame(drawFrame);
      }
    },
    clear() {
      waiting = [];
      next = 0;
    },
    get size() {
      return waiting.length - next;
    },
  };
};
