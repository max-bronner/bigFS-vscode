import { describeError } from '../../../core/errors';
import type { Instance } from '../instance';
import { callValue, joinArray, toAvmString } from './calls';
import { getMember, getTargetPath } from './displayObjects';
import { execute, MAX_STEPS } from './execution';
import { Halt } from './halt';
import { setMember } from './memberWrites';
import { installNatives } from './natives';
import {
  createArray,
  createClipFrame,
  getClipObject,
  getClipOf,
} from './objects';
import { OPERATIONS } from './ops/operations';
import { gotoValue } from './ops/timelineOps';
import { AsObject } from './value';
import type {
  BuiltinProtos,
  NativeFunction,
  StageHost,
  Value,
} from './value';
import {
  findTargetClip,
  getVariable,
  lookupVariable,
  setVariable,
} from './variables';
import type {
  EngineHooks,
  EngineVm,
  Operation,
  VmState,
} from './vmState';

const MAX_NESTING = 32;

export const MAX_INTERVALS = 256;

export const toIntervalTicks = (ms: number): number =>
  Number.isFinite(ms) ? Math.max(1, Math.round((ms * 30) / 1000)) : 1;

export class Vm implements VmState, EngineVm {
  public readonly global: AsObject;
  public readonly protos: BuiltinProtos;
  public readonly externObject: AsObject;
  public readonly clips = new WeakMap<Instance, AsObject>();
  public readonly registers: Value[] = [];
  public budget = MAX_STEPS;
  public readonly operations: ReadonlyMap<string, Operation> = OPERATIONS;
  private nesting = 0;
  private seed = 0x2545f491;
  private nextInterval = 1;
  public ticks = 0;
  public readonly intervals = new Map<
    number,
    { callee: Value; self: Value; every: number; due: number; args: Value[] }
  >();
  public readonly initialised = new Set<string>();

  public constructor(
    public readonly stage: StageHost,
    public readonly engine: EngineHooks,
  ) {
    const object = new AsObject();
    const proto = (parent = object) => new AsObject(parent);

    this.protos = {
      object,
      function: proto(),
      array: proto(),
      string: proto(),
      number: proto(),
      boolean: proto(),
      movieClip: proto(),
      button: proto(),
      textField: proto(),
    };
    this.global = new AsObject(object);
    this.externObject = new AsObject(object);
    this.global.define('extern', this.externObject);
    installNatives(this);
    engine.bind(this);
  }

  public runBlock(clip: Instance, block: number, owner = clip): void {
    const code = owner.movie.code?.[block];

    if (!code) {
      return;
    }
    this.settled(() =>
      this.guard(`block ${block}`, () =>
        execute(this, code, createClipFrame(this, clip, owner.movie)),
      ),
    );
  }

  private settled<T>(run: () => T): T {
    if (this.nesting > 0) {
      return run();
    }
    this.engine.sync();
    try {
      return run();
    } finally {
      this.engine.sync();
    }
  }

  private guard(what: string, run: () => unknown): unknown {
    if (this.nesting >= MAX_NESTING) {
      this.engine.log(
        `script skipped: ${what} nests ${MAX_NESTING} deep in other scripts`,
      );
      return undefined;
    }
    if (this.nesting === 0) {
      this.budget = MAX_STEPS;
    }
    this.nesting++;
    try {
      return run();
    } catch (error) {
      this.engine.log(
        error instanceof Halt
          ? `script stopped in ${what}: ${error.message}`
          : `script failed in ${what}: ${describeError(error)}`,
      );
      return undefined;
    } finally {
      this.nesting--;
      if (this.nesting === 0) {
        this.stage.idle();
      }
    }
  }

  public assertValue(path: string, value: Value): void {
    const frame = createClipFrame(this, this.stage.root);
    const target = `_root.${path}`;
    const held = lookupVariable(this, frame, target).value;

    if (held instanceof AsObject || Object.is(held, value)) {
      return;
    }
    setVariable(this, frame, target, value);
  }

  public callFromEngine(callee: Value, self: Value, args: Value[]): Value {
    return this.settled(() =>
      this.guard('a call', () => this.call(callee, self, args, 'engine')),
    ) as Value;
  }

  public readBound(clip: Instance, name: string): Value {
    return this.guard(
      'a text field',
      () => getVariable(this, createClipFrame(this, clip), name, false).value,
    ) as Value;
  }

  public get isBusy(): boolean {
    return this.nesting > 0;
  }

  public peekObject(instance: Instance): AsObject | undefined {
    return this.clips.get(instance);
  }

  public runIntervals(): void {
    for (const [id, interval] of [...this.intervals]) {
      if (interval.due <= this.ticks && this.intervals.has(id)) {
        interval.due = this.ticks + interval.every;
        this.callFromEngine(interval.callee, interval.self, interval.args);
      }
    }
  }

  public targetPath(instance: Instance, separator: '.' | '/'): string {
    return getTargetPath(instance, separator);
  }

  public objectOf(instance: Instance): AsObject {
    return getClipObject(this, instance);
  }

  public clipAt(target: Value, from: Instance): Instance | undefined {
    return findTargetClip(
      this,
      createClipFrame(this, from),
      from,
      target,
      false,
    );
  }

  public clipOf(value: Value): Instance | undefined {
    return getClipOf(value);
  }

  public string(value: Value): string {
    return toAvmString(this, value);
  }

  public join(array: AsObject, separator: string): string {
    return joinArray(this, array, separator);
  }

  public array(values: Value[]): AsObject {
    return createArray(this, values);
  }

  public object(): AsObject {
    return new AsObject(this.protos.object);
  }

  public native(name: string, call: NativeFunction): AsObject {
    const fn = new AsObject(this.protos.function, { type: 'native', call });

    fn.define('name', name);
    return fn;
  }

  public random(): number {
    let x = this.seed;

    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 0x1_0000_0000;
  }

  public now(): number {
    return Math.trunc((this.ticks * 1000) / 30);
  }

  public interval(
    callee: Value,
    self: Value,
    ms: number,
    args: Value[],
  ): number {
    if (this.intervals.size >= MAX_INTERVALS) {
      this.engine.log(
        `setInterval ignored: ${MAX_INTERVALS} timers are running`,
      );
      return 0;
    }

    const id = this.nextInterval++;
    const every = toIntervalTicks(ms);

    this.intervals.set(id, {
      callee,
      self,
      every,
      due: this.ticks + every,
      args,
    });
    return id;
  }

  public clearInterval(id: number): void {
    this.intervals.delete(id);
  }

  public member(object: Value, name: string): Value {
    return getMember(this, object, name);
  }

  public setMember(object: Value, name: string, value: Value): void {
    setMember(this, object, name, value);
  }

  public call(callee: Value, self: Value, args: Value[], name: string): Value {
    return callValue(this, callee, self, args, name);
  }

  public goto(clip: Instance, target: Value, stop: boolean): void {
    gotoValue(this, createClipFrame(this, clip), clip, target, stop);
  }

  public loadMovie(into: Instance | number, url: string): void {
    this.engine.log(
      `${url ? `loadMovie ${JSON.stringify(url)}` : 'unloadMovie'} into ${
        typeof into === 'number' ? `_level${into}` : getTargetPath(into, '.')
      }`,
    );
    this.stage.loadMovie(into, url.trim() || undefined);
  }
}
