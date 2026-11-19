import { DOWN, OVER, UP } from './buttonState';

export interface PointerGesture {
  state: number;
  condition: number;
  clipEvent: number;
  handler: string;
}

const defineGesture = (
  state: number,
  condition: number,
  clipEventBit: number,
  handler: string,
): PointerGesture => ({
  state,
  condition,
  clipEvent: 1 << clipEventBit,
  handler,
});

export const POINTER_GESTURES = {
  rollOver: defineGesture(OVER, 0x1, 13, 'onRollOver'),
  rollOut: defineGesture(UP, 0x2, 14, 'onRollOut'),
  press: defineGesture(DOWN, 0x4, 10, 'onPress'),
  release: defineGesture(OVER, 0x8, 11, 'onRelease'),
  dragOut: defineGesture(OVER, 0x10, 16, 'onDragOut'),
  dragOver: defineGesture(DOWN, 0x20, 15, 'onDragOver'),
  releaseOutside: defineGesture(UP, 0x40, 12, 'onReleaseOutside'),
};

export const POINTER_CLIP_EVENTS = Object.values(POINTER_GESTURES).reduce(
  (bits, { clipEvent }) => bits | clipEvent,
  0,
);
