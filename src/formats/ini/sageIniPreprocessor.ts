const OPERATIONS: Record<string, (a: number, b: number) => number> = {
  ADD: (a, b) => a + b,
  SUBTRACT: (a, b) => a - b,
  MULTIPLY: (a, b) => a * b,
  DIVIDE: (a, b) => a / b,
};

const MAX_CHAIN = 256;

export interface SageOperand {
  text: string;
  start: number;
  end: number;
}

export interface SageCall {
  line: number;
  start: number;
  end: number;
  operation: string;
  operands: SageOperand[];
  error?: string;
}

const CALL_START = /#([A-Za-z_]+)\(/g;

export const scanCalls = (content: string, line: number): SageCall[] => {
  const calls: SageCall[] = [];

  CALL_START.lastIndex = 0;

  for (
    let match = CALL_START.exec(content);
    match;
    match = CALL_START.exec(content)
  ) {
    const operation = match[1].toUpperCase();
    const start = match.index;
    const open = start + match[0].length;
    const close = content.indexOf(')', open);
    const end = close < 0 ? content.length : close + 1;
    const operands: SageOperand[] = [];

    if (close >= 0) {
      for (const operand of content.slice(open, close).matchAll(/[^\s,]+/g)) {
        operands.push({
          text: operand[0],
          start: open + operand.index,
          end: open + operand.index + operand[0].length,
        });
      }
    }

    const error = !(operation in OPERATIONS)
      ? `'#${match[1]}' is not an arithmetic call; the engine has #ADD, #SUBTRACT, #MULTIPLY and #DIVIDE`
      : close < 0
        ? `#${operation} is missing its closing ')'`
        : operands.length !== 2
          ? `#${operation} takes two operands, not ${operands.length}`
          : operation === 'DIVIDE' && parseNumber(operands[1].text) === 0
            ? '#DIVIDE by zero'
            : undefined;

    calls.push({ line, start, end, operation, operands, error });
    CALL_START.lastIndex = end;
  }

  return calls;
};

const parseNumber = (text: string): number | undefined => {
  const match = /^[+-]?(\d+\.?\d*|\.\d+)%?$/.exec(text);

  return match ? parseFloat(text) : undefined;
};

export type SageValue = { value: number } | { error: string };

export type LookupMacro = (name: string) => string | undefined;

const evaluateOperand = (
  text: string,
  lookupMacro: LookupMacro,
  chain: readonly string[],
): SageValue => {
  const number = parseNumber(text);

  if (number !== undefined) {
    return { value: number };
  }

  const body = lookupMacro(text)?.trim();

  if (body === undefined) {
    return { error: `'${text}' is neither a number nor a known macro` };
  }

  const key = text.toLowerCase();

  if (chain.includes(key) || chain.length >= MAX_CHAIN) {
    return { error: `'${text}' refers to itself through other macros` };
  }

  const bodyNumber = parseNumber(body);

  if (bodyNumber !== undefined) {
    return { value: bodyNumber };
  }

  const [call] = scanCalls(body, 0);

  if (call && call.start === 0 && call.end === body.length) {
    return evaluateCall(call, lookupMacro, [...chain, key]);
  }

  if (/^\S+$/.test(body) && lookupMacro(body) !== undefined) {
    return evaluateOperand(body, lookupMacro, [...chain, key]);
  }

  return { error: `'${text}' stands for '${body}', which is not a number` };
};

export const evaluateCall = (
  call: SageCall,
  lookupMacro: LookupMacro,
  chain: readonly string[] = [],
): SageValue => {
  if (call.error) {
    return { error: call.error };
  }

  const [left, right] = call.operands.map((operand) =>
    evaluateOperand(operand.text, lookupMacro, chain),
  );

  if ('error' in left) {
    return left;
  }

  if ('error' in right) {
    return right;
  }

  if (call.operation === 'DIVIDE' && right.value === 0) {
    return { error: '#DIVIDE by zero' };
  }

  return { value: OPERATIONS[call.operation](left.value, right.value) };
};

export const evaluateMacroBody = (
  body: string,
  lookupMacro: LookupMacro,
): SageValue | undefined => {
  const trimmed = body.trim();
  const [call] = scanCalls(trimmed, 0);

  if (call && call.start === 0 && call.end === trimmed.length) {
    return evaluateCall(call, lookupMacro);
  }

  return undefined;
};

export const formatValue = (value: number): string =>
  String(Math.round(value * 1e6) / 1e6);
