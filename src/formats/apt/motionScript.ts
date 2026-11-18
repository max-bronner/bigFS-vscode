import { EASINGS, compileExpression } from '../../core/expression';
import type { DetectedTween, Pose, TimelineOperation } from './aptTimeline';

const PROPERTIES: (keyof Pose)[] = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'skew',
  'alpha',
];

export class MotionScriptError extends Error {
  public constructor(
    public readonly line: number,
    message: string,
  ) {
    super(`Line ${line + 1}: ${message}`);
  }
}

const property = (name: string, line: number): keyof Pose => {
  const found = PROPERTIES.find(
    (each) => each.toLowerCase() === name.toLowerCase(),
  );

  if (!found) {
    throw new MotionScriptError(
      line,
      `${name} is not a property: ${PROPERTIES.join(', ')}`,
    );
  }
  return found;
};

const number = (text: string, line: number): number => {
  const value = Number(text);

  if (!Number.isFinite(value)) {
    throw new MotionScriptError(line, `${text} is not a number`);
  }
  return value;
};

export const parseMotionScript = (source: string): TimelineOperation[] => {
  const operations: TimelineOperation[] = [];

  source.split(/\r?\n/).forEach((raw, line) => {
    const text = raw.replace(/(\/\/|#).*$/, '').trim();

    if (!text) {
      return;
    }

    const head =
      /^(?:depth\s+(-?\d+)\s*,\s*)?frames?\s+(\d+)(?:\s*-\s*(\d+))?\s*:\s*(.+)$/i.exec(
        text,
      );

    if (!head) {
      throw new MotionScriptError(
        line,
        'write [depth N,] frames A-B: what happens',
      );
    }

    const depth = head[1] === undefined ? undefined : Number(head[1]);
    const from = Number(head[2]);
    const to = head[3] === undefined ? from : Number(head[3]);

    if (to < from) {
      throw new MotionScriptError(line, `frames ${from}-${to} run backwards`);
    }

    const needDepth = (what: string) => {
      if (depth === undefined) {
        throw new MotionScriptError(line, `${what} needs a depth`);
      }
      return depth;
    };

    for (const action of head[4]
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)) {
      const words = action.split(/\s+/);
      const verb = words[0].toLowerCase();
      const tween = /^(\w+)\s+(-?[\d.]+)\s*->\s*(-?[\d.]+)(?:\s+(\w+))?$/.exec(
        action,
      );
      const formula = /^(\w+)\s*=\s*(.+)$/.exec(action);

      if (tween) {
        const key = property(tween[1], line);
        const start = number(tween[2], line);
        const end = number(tween[3], line);
        const easing = tween[4] ?? 'linear';

        if (!EASINGS[easing]) {
          throw new MotionScriptError(
            line,
            `${easing} is not an easing: ${Object.keys(EASINGS).join(', ')}`,
          );
        }
        operations.push({
          op: 'animate',
          depth: needDepth('a tween'),
          from,
          to,
          formulas: { [key]: `${start} + (${end} - ${start}) * t` },
          easing,
        });
      } else if (formula) {
        const key = property(formula[1], line);

        try {
          compileExpression(formula[2]);
        } catch (error) {
          throw new MotionScriptError(line, (error as Error).message);
        }
        operations.push({
          op: 'animate',
          depth: needDepth('a formula'),
          from,
          to,
          formulas: { [key]: formula[2] },
        });
      } else if (verb === 'fade' || verb === 'hide') {
        operations.push({
          op: 'hide',
          depth: needDepth(verb),
          from,
          to,
          how: verb === 'fade' ? 'alpha' : 'remove',
        });
      } else if (verb === 'show') {
        operations.push({
          op: 'show',
          depth: needDepth('show'),
          from,
          to,
          like: from > 0 ? from - 1 : to + 1,
        });
      } else if (verb === 'insert' && words.length === 2) {
        operations.push({
          op: 'insert',
          at: to + 1,
          count: number(words[1], line),
        });
      } else if (verb === 'retime' && words.length === 2) {
        operations.push({
          op: 'retime',
          from,
          to,
          length: number(words[1], line),
        });
      } else if (
        (verb === 'delete' || verb === 'duplicate' || verb === 'reverse') &&
        words.length === 1
      ) {
        operations.push({ op: verb, from, to });
      } else {
        throw new MotionScriptError(
          line,
          `"${action}" is not something a script does`,
        );
      }
    }
  });
  return operations;
};

const round = (value: number) => Math.round(value * 1000) / 1000;

export const tweensAsScript = (tweens: DetectedTween[]): string =>
  tweens
    .map(
      (tween) =>
        `depth ${tween.depth}, frames ${tween.from}-${tween.to}: ` +
        tween.changes
          .map(
            (key) =>
              `${key} ${round(tween.start[key])} -> ${round(tween.end[key])}` +
              (tween.easing === 'linear' ? '' : ` ${tween.easing}`),
          )
          .join('; '),
    )
    .join('\n');
