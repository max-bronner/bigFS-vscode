import type { AptInstruction } from '../../../formats/apt/aptBytecode';
import type { Instance } from '../instance';
import type { PageMovie } from '../protocol';
import type { AsObject, NativeHost, Scope, Value } from './value';

export interface EngineHooks {
  bind(vm: EngineVm): void;
  extern(name: string): Value;
  setExtern(name: string, value: Value): void;
  call(name: string, args: string[]): Value;
  command(command: string, args: string): void;
  read(
    path: string,
    value: Value,
    found: boolean,
    counted: boolean,
    local: boolean,
  ): Value;
  sync(): void;
  defined(owner: AsObject, name: string, fn: AsObject): void;
  log(line: string): void;
}

export interface EngineVm extends NativeHost {
  assertValue(path: string, value: Value): void;
  callFromEngine(callee: Value, self: Value, args: Value[]): Value;
  targetPath(instance: Instance, separator: '.' | '/'): string;
}

export interface Frame {
  movie: PageMovie;
  scope: Scope;
  pool: Value[];
  self: Value;
  target?: Instance;
  base?: Instance;
  registers?: Value[];
  stack: Value[];
  depth: number;
  jumpTo?: number;
  returnValue?: Value;
}

export type StepOutcome = undefined | 'end' | 'jump' | 'return';

export type Operation = (
  vm: VmState,
  frame: Frame,
  instruction: AptInstruction,
) => StepOutcome;

export type OperationGroup = Record<string, Operation>;

export interface VmState extends NativeHost {
  readonly externObject: AsObject;
  readonly engine: EngineHooks;
  readonly clips: WeakMap<Instance, AsObject>;
  readonly registers: Value[];
  budget: number;
  readonly operations: ReadonlyMap<string, Operation>;
}
