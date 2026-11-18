import type { AptFunction } from '../../../formats/apt/aptBytecode';
import type { Instance } from '../player';
import type { PageMovie } from '../protocol';

export const SCRIPT_DEPTH_BIAS = 16384;

export type Value = undefined | null | boolean | number | string | AsObject;

export interface BytecodeFunction {
  def: AptFunction;
  scope: Scope;
  pool: Value[];
  movie: PageMovie;
  base?: Instance;
}

export type NativeFunction = (
  vm: NativeHost,
  self: Value,
  args: Value[],
) => Value;

export interface NativeHost {
  string(value: Value): string;
  member(object: Value, name: string): Value;
  setMember(object: Value, name: string, value: Value): void;
  call(callee: Value, self: Value, args: Value[], name: string): Value;
  array(values: Value[]): AsObject;
  object(): AsObject;
  clipOf(value: Value): Instance | undefined;
  clipAt(target: Value, from: Instance): Instance | undefined;
  objectOf(instance: Instance): AsObject;
  readonly stage: StageHost;
  random(): number;
  now(): number;
  interval(callee: Value, self: Value, ms: number, args: Value[]): number;
  clearInterval(id: number): void;
}

export interface StageHost {
  goTo(clip: Instance, frame: number, play: boolean): void;
  labelFrame(clip: Instance, label: string): number | undefined;
  setPlaying(clip: Instance, playing: boolean): void;
  attach(
    parent: Instance,
    linkage: string,
    name: string,
    depth: number,
  ): Instance | undefined;
  createEmpty(
    parent: Instance,
    name: string,
    depth: number,
  ): Instance | undefined;
  remove(clip: Instance): void;
  idle(): void;
  loadMovie(into: Instance | number, url: string | undefined): void;
  readonly root: Instance;
}

export type Kind =
  | { type: 'plain' }
  | { type: 'array' }
  | { type: 'function'; fn: BytecodeFunction }
  | { type: 'native'; call: NativeFunction }
  | { type: 'clip'; instance: Instance };

export interface Scope {
  values: AsObject;
  parent?: Scope;
  kind: 'global' | 'target' | 'local';
}

export class AsObject {
  private readonly props = new Map<
    string,
    { name: string; value: Value; hidden: boolean }
  >();

  public constructor(
    public proto?: AsObject,
    public kind: Kind = { type: 'plain' },
  ) {}

  public has(name: string): boolean {
    return this.props.has(name.toLowerCase());
  }

  public get(name: string): Value {
    return this.props.get(name.toLowerCase())?.value;
  }

  public set(name: string, value: Value): void {
    const key = name.toLowerCase();
    const existing = this.props.get(key);

    if (existing) {
      existing.value = value;
    } else {
      this.props.set(key, { name, value, hidden: false });
    }
  }

  public define(name: string, value: Value): void {
    this.props.set(name.toLowerCase(), { name, value, hidden: true });
  }

  public delete(name: string): boolean {
    return this.props.delete(name.toLowerCase());
  }

  public keys(): string[] {
    return [...this.props.values()].filter((p) => !p.hidden).map((p) => p.name);
  }

  public entries(): [string, Value][] {
    return [...this.props.values()].map((p) => [p.name, p.value]);
  }
}

export const parseNumber = (text: string): number => {
  const trimmed = text.trim();

  if (!trimmed) {
    return 0;
  }
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    return parseInt(trimmed.slice(2), 16);
  }

  const n = Number(trimmed);

  return Number.isNaN(n) &&
    /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(trimmed)
    ? parseFloat(trimmed)
    : n;
};

export const toNumber = (value: Value): number =>
  value === undefined || value instanceof AsObject
    ? NaN
    : value === null
      ? 0
      : typeof value === 'boolean'
        ? Number(value)
        : typeof value === 'number'
          ? value
          : parseNumber(value);

export const toBoolean = (value: Value): boolean => {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value instanceof AsObject) {
    return true;
  }

  const n = toNumber(value);

  return n !== 0 && !Number.isNaN(n);
};

export const toInt32 = (value: Value): number => {
  const n = toNumber(value);

  return Number.isFinite(n) ? Math.trunc(n) | 0 : 0;
};

export const formatNumber = (n: number): string =>
  Number.isNaN(n)
    ? 'NaN'
    : !Number.isFinite(n)
      ? n > 0
        ? 'Infinity'
        : '-Infinity'
      : String(n);

export const looseEquals = (a: Value, b: Value): boolean => {
  const absent = (v: Value) => v === undefined || v === null;

  if (absent(a) || absent(b)) {
    return absent(a) && absent(b);
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b;
  }
  if (a instanceof AsObject || b instanceof AsObject) {
    return a === b;
  }

  const x = toNumber(a);
  const y = toNumber(b);

  return !Number.isNaN(x) && x === y;
};
