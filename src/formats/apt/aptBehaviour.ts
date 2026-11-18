import { decodeBlock } from './aptBytecode';
import { lift } from './aptDecompiler';
import type { ConstItem } from './aptMovie';
import type { Expr, Stmt } from './aptScriptSyntax';

export type TargetPath = string[];

export type TimelineCommand =
  | {
      op: 'goto';
      target: TargetPath;
      frame?: number;
      label?: string;
      play: boolean;
    }
  | { op: 'play' | 'stop' | 'next' | 'prev'; target: TargetPath };

export interface Behaviour {
  commands: TimelineCommand[];
  skipped: number;
  conditional: boolean;
}

const CALLS: Record<string, 'play' | 'stop' | 'next' | 'prev'> = {
  play: 'play',
  stop: 'stop',
  nextframe: 'next',
  prevframe: 'prev',
};

const pathOf = (text: string): TargetPath => {
  const absolute = text.startsWith('/');
  const parts = text
    .split(/[/:]/)
    .flatMap((part) =>
      part === '..' ? ['_parent'] : part.split('.').filter(Boolean),
    );

  return absolute ? ['_root', ...parts] : parts;
};

const targetOf = (expr: Expr): TargetPath | undefined => {
  switch (expr.k) {
    case 'kw':
      return expr.v === 'this' ? [] : undefined;
    case 'var':
      return pathOf(expr.name);
    case 'str':
      return pathOf(expr.v);
    case 'member': {
      const parent = targetOf(expr.obj);

      return parent && [...parent, expr.name];
    }
    default:
      return undefined;
  }
};

const gotoArgument = (
  expr: Expr | undefined,
): { frame?: number; label?: string } | undefined =>
  expr?.k === 'str'
    ? { label: expr.v }
    : expr?.k === 'num' && Number.isInteger(expr.v) && expr.v >= 1
      ? { frame: expr.v - 1 }
      : undefined;

const callCommand = (
  target: TargetPath,
  name: Expr,
  args: Expr[],
): TimelineCommand | undefined => {
  if (name.k !== 'str') {
    return undefined;
  }

  const lower = name.v.toLowerCase();

  if (lower === 'gotoandplay' || lower === 'gotoandstop') {
    const where = gotoArgument(args[0]);

    return (
      where && { op: 'goto', target, ...where, play: lower === 'gotoandplay' }
    );
  }

  const op = CALLS[lower];

  return op && !args.length ? { op, target } : undefined;
};

export const behaviourOf = (
  apt: Uint8Array,
  block: number,
  constants: readonly ConstItem[],
): Behaviour => {
  const stmts: Stmt[] = lift(decodeBlock(apt, block), {
    constants,
    mode: 'script',
  });
  const commands: TimelineCommand[] = [];
  let scope: TargetPath = [];
  let skipped = 0;

  for (let index = 0; index < stmts.length; index++) {
    const stmt = stmts[index];

    if (['if', 'goto', 'label', 'block', 'while', 'return'].includes(stmt.k)) {
      return {
        commands,
        skipped: skipped + stmts.length - index,
        conditional: true,
      };
    }
    if (stmt.k === 'func' || stmt.k === 'pool') {
      continue;
    }

    const e = stmt.k === 'expr' ? stmt.e : undefined;
    let command: TimelineCommand | undefined;

    if (e?.k === 'call') {
      command = callCommand(scope, e.name, e.args);
    } else if (e?.k === 'mcall') {
      const target = targetOf(e.obj);

      command = target && callCommand([...scope, ...target], e.name, e.args);
    } else if (e?.k === 'intr') {
      const operand = e.operand;

      switch (e.op) {
        case 'SetTarget':
          if (operand?.k === 'str') {
            scope = pathOf(operand.v);
            continue;
          }
          break;
        case 'GotoLabel':
          if (operand?.k === 'str') {
            command = {
              op: 'goto',
              target: scope,
              label: operand.v,
              play: false,
            };
          }
          break;
        case 'GotoFrame':
          if (operand?.k === 'num') {
            command = {
              op: 'goto',
              target: scope,
              frame: operand.v,
              play: false,
            };
          }
          break;
        case 'Play':
        case 'Stop':
        case 'NextFrame':
        case 'PrevFrame':
          command = {
            op: (
              {
                Play: 'play',
                Stop: 'stop',
                NextFrame: 'next',
                PrevFrame: 'prev',
              } as const
            )[e.op],
            target: scope,
          };
          break;
      }
    }

    if (command) {
      commands.push(command);
    } else {
      skipped++;
    }
  }

  return { commands, skipped, conditional: false };
};
