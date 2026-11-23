import type { TimelineOperation } from '../../formats/apt/aptTimelineEdits';
import type { MenuEntry } from './popupMenu';

export type TimelineForm = 'tween' | 'formula' | 'script' | 'insert' | 'retime';

export interface TimelineMenuContext {
  from: number;
  to: number;
  depth?: number;
  frameCount: number;
  isPlacedAtDepth: boolean;
  copiedFrom?: string;
  nearestPlaced?: number;
  run: (operation: TimelineOperation) => void;
  openForm: (form: TimelineForm) => void;
  copyMotion: () => void;
  pasteMotion: (mirror: 'x' | 'y' | undefined) => void;
}

export interface TimelineMenus {
  frames: MenuEntry[];
  motion: MenuEntry[];
  placement: MenuEntry[];
}

export const buildTimelineMenus = (context: TimelineMenuContext): TimelineMenus => {
  const { from, to, depth, frameCount, isPlacedAtDepth, copiedFrom, nearestPlaced, run } =
    context;
  const hasDepth = depth !== undefined;
  const paste = (label: string, mirror: 'x' | 'y' | undefined, how: string): MenuEntry => ({
    label,
    title: copiedFrom
      ? `Play the motion of ${copiedFrom} here from frame ${from}${how}`
      : 'Copy a motion first',
    enabled: isPlacedAtDepth && !!copiedFrom,
    run: () => context.pasteMotion(mirror),
  });

  return {
    frames: [
      {
        label: 'Insert Frames…',
        title: 'Insert frames after the range, holding its last frame',
        run: () => context.openForm('insert'),
      },
      {
        label: 'Delete Frames',
        title: 'Delete the frames, with their scripts and labels',
        enabled: to - from + 1 < frameCount,
        run: () => run({ op: 'delete', from, to }),
      },
      {
        label: 'Duplicate Frames',
        title: 'Copy the frames after the range',
        run: () => run({ op: 'duplicate', from, to }),
      },
      {
        label: 'Reverse',
        title: 'Play the range backwards',
        enabled: to > from,
        run: () => run({ op: 'reverse', from, to }),
      },
      {
        label: 'Retime…',
        title: 'Stretch or squeeze the range to a number of frames, interpolating motion',
        run: () => context.openForm('retime'),
      },
    ],
    motion: [
      {
        label: 'Tween…',
        title: 'Move, scale, turn or fade from the pose at the first frame to an end pose',
        enabled: isPlacedAtDepth,
        run: () => context.openForm('tween'),
      },
      {
        label: 'Formula…',
        title: 'Set properties by formulas of the frame',
        enabled: isPlacedAtDepth,
        run: () => context.openForm('formula'),
      },
      'separator',
      {
        label: 'Copy Motion',
        title: 'Remember how this depth moves over the range, relative to its first frame',
        enabled: isPlacedAtDepth && to > from,
        run: context.copyMotion,
      },
      paste('Paste Motion', undefined, ''),
      paste('Paste Mirrored ↔', 'x', ', mirrored left to right'),
      paste('Paste Mirrored ↕', 'y', ', mirrored top to bottom'),
    ],
    placement: [
      {
        label: 'Show',
        title: `Show it for the range as it is in frame ${nearestPlaced ?? '?'}, fully opaque`,
        enabled: hasDepth && (nearestPlaced !== undefined || isPlacedAtDepth),
        run: () => run({ op: 'show', depth: depth!, from, to, like: nearestPlaced ?? from }),
      },
      {
        label: 'Fade Out',
        title: 'Alpha 0 for the range; the instance stays, so its own animation goes on',
        enabled: hasDepth,
        run: () => run({ op: 'hide', depth: depth!, from, to, how: 'alpha' }),
      },
      {
        label: 'Remove',
        title: 'Take it off the stage for the range; it is placed again afterwards',
        enabled: hasDepth,
        run: () => run({ op: 'hide', depth: depth!, from, to, how: 'remove' }),
      },
    ],
  };
};

export const buildTimelineContextMenu = (
  menus: TimelineMenus,
  openScript: () => void,
): MenuEntry[] => [
  { heading: 'Frames' },
  ...menus.frames,
  'separator',
  { heading: 'Motion' },
  ...menus.motion,
  'separator',
  { heading: 'Placement' },
  ...menus.placement,
  'separator',
  {
    label: 'Motion Script…',
    title: 'The whole timeline as a few lines, like a CSS animation: edit and run it',
    run: openScript,
  },
];
