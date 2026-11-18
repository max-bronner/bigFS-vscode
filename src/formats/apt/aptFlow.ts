import type { Behaviour, TimelineCommand } from './aptBehaviour';
import type { Character, Frame } from './aptMovie';

export interface FrameLabel {
  label: string;
  frame: number;
}

export interface Jump {
  from:
    | { kind: 'frame'; frame: number }
    | { kind: 'button'; character: number; depth: number; frame: number };
  to?: number;
  label?: string;
  play: boolean;
}

export interface TimelineFlow {
  labels: FrameLabel[];
  stops: number[];
  plays: number[];
  jumps: Jump[];
  conditional: number[];
}

const own = (commands: TimelineCommand[]) =>
  commands.filter((command) => command.target.length === 0);

export const timelineFlow = (
  frames: readonly Frame[],
  behaviours: Readonly<Record<number, Behaviour>>,
  characters: readonly (Character | undefined)[],
): TimelineFlow => {
  const labels = frames.flatMap((frame, index) =>
    frame.items.flatMap((item) =>
      item.type === 'frameLabel' ? [{ label: item.label, frame: index }] : [],
    ),
  );
  const frameOf = (label: string) =>
    labels.find((each) => each.label.toLowerCase() === label.toLowerCase())
      ?.frame;
  const flow: TimelineFlow = {
    labels,
    stops: [],
    plays: [],
    jumps: [],
    conditional: [],
  };
  const jump = (command: TimelineCommand, from: Jump['from']) => {
    if (command.op !== 'goto') {
      return;
    }
    flow.jumps.push({
      from,
      to:
        command.label !== undefined
          ? frameOf(command.label)
          : command.frame !== undefined && command.frame < frames.length
            ? command.frame
            : undefined,
      label: command.label,
      play: command.play,
    });
  };

  frames.forEach((frame, index) => {
    for (const item of frame.items) {
      if (item.type === 'action') {
        const behaviour = behaviours[item.block];

        if (!behaviour) {
          continue;
        }
        if (behaviour.conditional) {
          flow.conditional.push(index);
        }
        for (const command of own(behaviour.commands)) {
          if (command.op === 'stop') {
            flow.stops.push(index);
          } else if (command.op === 'play') {
            flow.plays.push(index);
          } else {
            jump(command, { kind: 'frame', frame: index });
          }
        }
      } else if (item.type === 'placeObject' && item.character !== undefined) {
        const character = characters[item.character];

        if (character?.type !== 'button') {
          continue;
        }
        if (
          flow.jumps.some(
            (each) =>
              each.from.kind === 'button' &&
              each.from.character === item.character &&
              each.from.depth === item.depth,
          )
        ) {
          continue;
        }
        for (const action of character.actions) {
          for (const command of own(behaviours[action.block]?.commands ?? [])) {
            jump(command, {
              kind: 'button',
              character: item.character,
              depth: item.depth,
              frame: index,
            });
          }
        }
      }
    }
  });
  return flow;
};
