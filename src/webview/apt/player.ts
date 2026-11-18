import { Vm } from "./avm/vm";
import type { EngineHooks } from "./avm/vm";
import type { StageHost } from "./avm/value";
import type {
  Behaviour,
  TimelineCommand,
} from "../../formats/apt/aptBehaviour";
import type {
  ButtonRecord,
  Character,
  Frame,
  Matrix2,
} from "../../formats/apt/aptMovie";
import type { PageMovie } from "./protocol";
import { movieNameOf } from "./avm/movieLoad";
import { displayList, framesOf } from "./timeline";
import type { ColorTransform } from "./timeline";

export const UP = 1;
export const OVER = 2;
export const DOWN = 4;
const HIT = 8;

export const CONDITION = {
  rollOver: 0x1,
  rollOut: 0x2,
  press: 0x4,
  release: 0x8,
  releaseOutside: 0x40,
};

const MAX_CHAIN = 16;
const MAX_DEPTH = 12;
const MAX_ACTIONS = 1000;
const LEVEL_DEPTH = 1_000_000;

export interface Resolved {
  movie: PageMovie;
  id: number;
  character: Character;
}

export interface Instance {
  path: string;
  movie: PageMovie;
  id: number;
  character?: Character;
  missing?: string;
  parent?: Instance;
  name?: string;
  matrix: Matrix2;
  translate: [number, number];
  alpha: number;
  clipDepth?: number;
  clipActions?: { events: number; block: number }[];
  tint?: ColorTransform;
  visible?: boolean;
  text?: string;
  scripted?: boolean;
  dynamic?: boolean;
  removed?: boolean;
  born: number;
  placed: number;
  placedItem?: number;
  matrixItem?: number;
  frames: Frame[];
  frame: number;
  playing: boolean;
  children: Map<string, Instance>;
  hits: Instance[];
  buttonState: number;
  forced?: number;
  created: number;
}

export interface PlayerOptions {
  resolve: (movie: PageMovie, id: number) => Resolved | undefined;
  scripts: boolean;
  rootScripts: boolean;
  log?: (line: string) => void;
  fetchMovie?: (
    name: string,
    done: (movie: PageMovie | string) => void,
  ) => void;
  engine?: EngineHooks;
}

const CLIP_EVENT = {
  load: 1 << 0,
  enterFrame: 1 << 1,
  unload: 1 << 2,
  initialize: 1 << 9,
  construct: 1 << 18,
};

const HANDLERS: Record<number, string> = {
  [CONDITION.rollOver]: "onRollOver",
  [CONDITION.rollOut]: "onRollOut",
  [CONDITION.press]: "onPress",
  [CONDITION.release]: "onRelease",
  [CONDITION.releaseOutside]: "onReleaseOutside",
};

const isTimeline = (instance: Instance) =>
  instance.character?.type === "sprite" || instance.character?.type === "movie";

export class Player implements StageHost {
  public readonly root: Instance;
  public ticks = 0;
  public readonly vm?: Vm;
  private chain = 0;
  private readonly waiting: (() => void)[] = [];
  private draining = false;

  public constructor(
    movie: PageMovie,
    id: number,
    private readonly options: PlayerOptions,
  ) {
    if (options.engine) {
      this.vm = new Vm(this, options.engine);
    }
    this.draining = true;
    try {
      this.queueInitActions(movie);
      this.root = this.create(movie, id, "", undefined, {
        matrix: [1, 0, 0, 1],
        translate: [0, 0],
        alpha: 1,
        born: 0,
      });
    } finally {
      this.draining = false;
    }
    this.idle();
  }

  private queueInitActions(movie: PageMovie, on?: Instance): void {
    const vm = this.vm;

    if (!vm) {
      return;
    }
    const timelines = [
      movie.frames,
      ...movie.characters.flatMap((character) =>
        character.type === "sprite"
          ? [movie.spriteFrames[character.id] ?? []]
          : [],
      ),
    ];

    for (const frames of timelines) {
      for (const frame of frames) {
        for (const item of frame.items) {
          const key = `${movie.name}#${item.type === "initAction" ? item.sprite : ""}`;

          if (item.type === "initAction" && !vm.initialised.has(key)) {
            vm.initialised.add(key);
            this.later(() => vm.runBlock(on ?? this.root, item.block));
          }
        }
      }
    }
  }

  public loadMovie(into: Instance | number, url: string | undefined): void {
    const log = (line: string) => this.options.log?.(`loadMovie: ${line}`);

    if (typeof into !== "number" && !into.parent) {
      log("the movie shown cannot be replaced or emptied");
      return;
    }
    if (url === undefined) {
      this.later(() => this.unload(into));
      this.idle();
      return;
    }

    const name = movieNameOf(url);

    if (!name) {
      log(`${JSON.stringify(url)} names no movie`);
      return;
    }
    if (into === 0) {
      log(`${name} cannot replace _level0, the movie shown`);
      return;
    }
    if (!this.options.fetchMovie) {
      log(`${name} cannot be loaded here`);
      return;
    }
    this.options.fetchMovie(name, (found) => {
      if (typeof found === "string") {
        log(`${name} not loaded: ${found}`);
        return;
      }
      this.later(() => this.mount(into, found));
      this.idle();
    });
  }

  private levelClip(level: number): Instance | undefined {
    return [...this.root.children.values()].find(
      (child) => child.name?.toLowerCase() === `_level${level}`,
    );
  }

  private mount(into: Instance | number, movie: PageMovie): void {
    const rootId = movie.characters.findIndex(
      (character) => character?.type === "movie",
    );
    const clip =
      typeof into === "number"
        ? (this.levelClip(into) ??
          this.createEmpty(this.root, `_level${into}`, LEVEL_DEPTH + into))
        : into;

    if (rootId < 0 || clip.removed) {
      this.options.log?.(
        `loadMovie: ${movie.name} ${rootId < 0 ? "has no root timeline" : "was unloaded before it arrived"}`,
      );
      return;
    }
    clip.children.forEach((child) => this.retire(child));
    clip.children = new Map();
    clip.hits = [];
    clip.movie = movie;
    clip.id = rootId;
    clip.character = movie.characters[rootId];
    clip.missing = undefined;
    clip.frames = framesOf(movie, clip.character);
    clip.frame = 0;
    clip.playing = true;
    clip.visible = true;
    clip.created = this.ticks;

    this.vm?.initialised.forEach((key) => {
      if (key.startsWith(`${movie.name}#`)) {
        this.vm!.initialised.delete(key);
      }
    });
    this.queueInitActions(movie, clip);
    this.enter(clip, 0);
    this.options.log?.(`loadMovie: ${movie.name} is in ${describe(clip)}`);
    this.idle();
  }

  private unload(into: Instance | number): void {
    const clip = typeof into === "number" ? this.levelClip(into) : into;

    if (!clip || clip.removed) {
      return;
    }
    if (typeof into === "number") {
      this.remove(clip);
      return;
    }
    clip.children.forEach((child) => this.retire(child));
    clip.children = new Map();
    clip.frames = [];
    clip.frame = 0;
    clip.playing = false;
  }

  public tick(): void {
    this.ticks++;

    const timelines: Instance[] = [];
    const gather = (instance: Instance) => {
      if (isTimeline(instance)) {
        timelines.push(instance);
      }
      instance.children.forEach(gather);
    };

    gather(this.root);
    for (const timeline of timelines) {
      if (
        this.attached(timeline) &&
        timeline.playing &&
        timeline.created < this.ticks &&
        timeline.frames.length > 1
      ) {
        this.enter(timeline, (timeline.frame + 1) % timeline.frames.length);
      }
    }

    const vm = this.vm;

    if (vm && this.scriptsRun(this.root)) {
      vm.ticks = this.ticks;
      for (const instance of this.all()) {
        if (instance.clipActions) {
          this.clipEvent(instance, CLIP_EVENT.enterFrame);
        }

        const object = vm.peekObject(instance);
        const handler = object?.has("onEnterFrame")
          ? object.get("onEnterFrame")
          : undefined;

        if (handler !== undefined && object) {
          vm.callFromEngine(handler, object, []);
        }
      }
      vm.runIntervals();
    }
  }

  public idle(): void {
    if (!this.vm || this.draining || this.vm.busy) {
      return;
    }
    this.draining = true;
    try {
      for (let ran = 0; this.waiting.length; ran++) {
        if (ran >= MAX_ACTIONS) {
          this.options.log?.(
            `stopped after ${MAX_ACTIONS} scripts in one go: scripts keep starting each other`,
          );
          this.waiting.length = 0;
          break;
        }
        this.waiting.shift()!();
      }
    } finally {
      this.draining = false;
    }
  }

  private later(run: () => void): void {
    this.waiting.push(run);
  }

  public setPlaying(clip: Instance, playing: boolean): void {
    clip.playing = playing;
  }

  public attach(
    parent: Instance,
    linkage: string,
    name: string,
    depth: number,
  ): Instance | undefined {
    const byId = /^#(\d+)$/.exec(linkage);
    const id = byId
      ? Number(byId[1])
      : parent.movie.exports.find(
          (each) => each.name.toLowerCase() === linkage.toLowerCase(),
        )?.character;

    if (id === undefined) {
      this.options.log?.(`attachMovie: nothing is exported as "${linkage}"`);
      return undefined;
    }
    return this.place(
      parent,
      depth,
      this.create(parent.movie, id, `${parent.path}/${depth}`, parent, {
        matrix: [1, 0, 0, 1],
        translate: [0, 0],
        alpha: 1,
        born: parent.frame,
        name,
      }),
    );
  }

  public createEmpty(parent: Instance, name: string, depth: number): Instance {
    const instance = this.create(
      parent.movie,
      -1,
      `${parent.path}/${depth}`,
      parent,
      {
        matrix: [1, 0, 0, 1],
        translate: [0, 0],
        alpha: 1,
        born: parent.frame,
        name,
      },
    );

    instance.character = {
      type: "sprite",
      id: -1,
      offset: 0,
      frameCount: 0,
      framesOffset: 0,
    };
    instance.missing = undefined;
    return this.place(parent, depth, instance);
  }

  public remove(clip: Instance): void {
    const parent = clip.parent;

    if (!parent) {
      return;
    }
    for (const [key, child] of parent.children) {
      if (child === clip) {
        parent.children.delete(key);
      }
    }
    this.retire(clip);
  }

  private place(parent: Instance, depth: number, instance: Instance): Instance {
    const old = parent.children.get(String(depth));

    if (old) {
      this.retire(old);
    }
    instance.dynamic = true;
    parent.children.set(String(depth), instance);
    parent.children = new Map(
      [...parent.children].sort(([a], [b]) => Number(a) - Number(b)),
    );
    return instance;
  }

  private retire(instance: Instance): void {
    if (instance.removed) {
      return;
    }
    this.clipEvent(instance, CLIP_EVENT.unload);
    instance.removed = true;
    instance.children.forEach((child) => this.retire(child));
  }

  private scriptsRun(timeline: Instance): boolean {
    return timeline === this.root
      ? this.options.rootScripts
      : this.options.scripts;
  }

  private clipEvent(instance: Instance, event: number): void {
    if (!this.vm || !instance.parent) {
      return;
    }
    const vm = this.vm;
    const parent = instance.parent;

    for (const action of instance.clipActions ?? []) {
      if (action.events & event) {
        this.later(() => vm.runBlock(instance, action.block, parent));
      }
    }
    this.idle();
  }

  public goTo(timeline: Instance, frame: number, play: boolean): void {
    timeline.playing = play;
    if (
      frame !== timeline.frame &&
      frame >= 0 &&
      frame < timeline.frames.length
    ) {
      this.enter(timeline, frame);
    }
  }

  public labelFrame(timeline: Instance, label: string): number | undefined {
    const wanted = label.toLowerCase();
    const index = timeline.frames.findIndex((frame) =>
      frame.items.some(
        (item) =>
          item.type === "frameLabel" && item.label.toLowerCase() === wanted,
      ),
    );

    return index < 0 ? undefined : index;
  }

  public labels(timeline: Instance): { label: string; frame: number }[] {
    return timeline.frames.flatMap((frame, index) =>
      frame.items.flatMap((item) =>
        item.type === "frameLabel" ? [{ label: item.label, frame: index }] : [],
      ),
    );
  }

  public force(button: Instance, state: number | undefined): void {
    button.forced = state;
    this.syncButton(button);
  }

  public hover(
    previous: Instance | undefined,
    next: Instance | undefined,
  ): void {
    if (previous === next) {
      return;
    }
    if (previous && this.attached(previous)) {
      this.buttonEvent(previous, CONDITION.rollOut, UP);
    }
    if (next) {
      this.buttonEvent(next, CONDITION.rollOver, OVER);
    }
  }

  public press(button: Instance): void {
    this.buttonEvent(button, CONDITION.press, DOWN);
  }

  public release(button: Instance, over: boolean): void {
    this.buttonEvent(
      button,
      over ? CONDITION.release : CONDITION.releaseOutside,
      over ? OVER : UP,
    );
  }

  public all(): Instance[] {
    const out: Instance[] = [];
    const visit = (instance: Instance) => {
      out.push(instance);
      instance.children.forEach(visit);
    };

    visit(this.root);
    return out;
  }

  public find(path: string): Instance | undefined {
    return this.all().find((instance) => instance.path === path);
  }

  private attached(instance: Instance): boolean {
    for (let at: Instance | undefined = instance; at; at = at.parent) {
      if (at === this.root) {
        return true;
      }
      if (
        at.parent &&
        ![...at.parent.children.values(), ...at.parent.hits].includes(at)
      ) {
        return false;
      }
    }
    return false;
  }

  private create(
    from: PageMovie,
    id: number,
    path: string,
    parent: Instance | undefined,
    place: Pick<
      Instance,
      "matrix" | "translate" | "alpha" | "born" | "clipDepth" | "clipActions"
    > & {
      name?: string;
      placedItem?: number;
      matrixItem?: number;
    },
  ): Instance {
    const found = this.options.resolve(from, id);
    const entry = found
      ? undefined
      : from.imports.find((each) => each.character === id);
    const instance: Instance = {
      path,
      clipActions: place.clipActions,
      movie: found?.movie ?? from,
      id: found?.id ?? id,
      character: found?.character,
      missing: found
        ? undefined
        : entry
          ? `${entry.movie}:${entry.name}`
          : "import",
      parent,
      name: place.name,
      matrix: place.matrix,
      translate: place.translate,
      alpha: place.alpha,
      clipDepth: place.clipDepth,
      born: place.born,
      placed: id,
      placedItem: place.placedItem,
      matrixItem: place.matrixItem,
      frames: found ? framesOf(found.movie, found.character) : [],
      frame: 0,
      playing: true,
      children: new Map(),
      hits: [],
      buttonState: UP,
      created: this.ticks,
    };
    const depth = path.split("/").length;

    if (depth > MAX_DEPTH) {
      return instance;
    }
    if (isTimeline(instance)) {
      this.enter(instance, 0);
    } else if (instance.character?.type === "button") {
      this.syncButton(instance);
    }
    if (parent && this.vm && this.scriptsRun(parent)) {
      this.clipEvent(
        instance,
        CLIP_EVENT.initialize | CLIP_EVENT.construct | CLIP_EVENT.load,
      );
    }
    return instance;
  }

  private enter(timeline: Instance, frame: number): void {
    timeline.frame = frame;
    this.syncTimeline(timeline);

    if (!this.scriptsRun(timeline)) {
      return;
    }

    const items = timeline.frames[frame]?.items ?? [];
    const vm = this.vm;

    if (vm) {
      for (const item of items) {
        const key = `${timeline.movie.name}#${item.type === "initAction" ? item.sprite : ""}`;

        if (item.type === "initAction" && !vm.initialised.has(key)) {
          vm.initialised.add(key);
          this.later(() => vm.runBlock(timeline, item.block));
        }
      }
      for (const item of items) {
        if (item.type === "action") {
          this.later(() => {
            if (timeline.frame === frame && !timeline.removed) {
              vm.runBlock(timeline, item.block);
            }
          });
        }
      }
      this.idle();
      return;
    }
    for (const item of items) {
      if (item.type === "action") {
        this.run(timeline, timeline.movie.behaviours[item.block], "frame");
      }
    }
  }

  private syncTimeline(timeline: Instance): void {
    const kept = new Map<string, Instance>();

    for (const placement of displayList(timeline.frames, timeline.frame)) {
      const key = String(placement.depth);
      const existing = timeline.children.get(key);
      if (
        existing &&
        !existing.dynamic &&
        existing.born === placement.born &&
        existing.placed === placement.character
      ) {
        Object.assign(
          existing,
          existing.scripted
            ? {}
            : {
                matrix: placement.matrix,
                translate: placement.translate,
                alpha: placement.alpha,
              },
          {
            clipDepth: placement.clipDepth,
            name: existing.scripted ? existing.name : placement.name,
            matrixItem: placement.matrixItem,
          },
        );
        kept.set(key, existing);
      } else {
        kept.set(
          key,
          this.create(
            timeline.movie,
            placement.character,
            `${timeline.path}/${placement.depth}`,
            timeline,
            placement,
          ),
        );
      }
    }
    for (const [key, child] of timeline.children) {
      if (child.dynamic && !kept.has(key)) {
        kept.set(key, child);
      } else if (kept.get(key) !== child) {
        this.retire(child);
      }
    }
    timeline.children = new Map(
      [...kept].sort(([a], [b]) => Number(a) - Number(b)),
    );
  }

  private syncButton(button: Instance): void {
    if (button.character?.type !== "button") {
      return;
    }

    const state = button.forced ?? button.buttonState;
    const kept = new Map<string, Instance>();
    const place = (record: ButtonRecord) =>
      this.create(
        button.movie,
        record.character,
        `${button.path}/b${record.depth}`,
        button,
        {
          matrix: record.matrix,
          translate: record.translate,
          alpha: 1,
          born: 0,
        },
      );

    for (const record of button.character.records) {
      if (record.flags & state) {
        const key = `b${record.depth}`;

        kept.set(key, button.children.get(key) ?? place(record));
      }
    }
    button.children = kept;
    if (!button.hits.length) {
      button.hits = button.character.records
        .filter((record) => record.flags & HIT)
        .map(place);
    }
  }

  private buttonEvent(
    button: Instance,
    condition: number,
    state: number,
  ): void {
    if (button.character?.type !== "button") {
      return;
    }

    button.buttonState = state;
    this.syncButton(button);

    const owner = button.parent ?? this.root;
    const name =
      Object.entries(CONDITION).find(([, bit]) => bit === condition)?.[0] ??
      "event";

    const vm = this.vm;

    for (const action of button.character.actions) {
      if (action.condition & condition) {
        if (vm) {
          this.options.log?.(`${name} on ${describe(button)}`);
          vm.runBlock(owner, action.block, button);
        } else {
          this.run(
            owner,
            button.movie.behaviours[action.block],
            `${name} on ${describe(button)}`,
          );
        }
      }
    }

    const handler = vm && HANDLERS[condition];

    if (vm && handler) {
      const self = vm.objectOf(button);
      const fn = vm.member(self, handler);

      if (fn !== undefined) {
        vm.callFromEngine(fn, self, []);
      }
    }
  }

  public textOf(instance: Instance): string | undefined {
    if (instance.text !== undefined) {
      return instance.text;
    }

    const character = instance.character;

    if (
      !this.vm ||
      character?.type !== "editText" ||
      !character.variable ||
      !instance.parent
    ) {
      return undefined;
    }

    const value = this.vm.readBound(instance.parent, character.variable);

    return value === undefined ? undefined : this.vm.string(value);
  }

  private run(
    self: Instance,
    behaviour: Behaviour | undefined,
    why: string,
  ): void {
    if (!behaviour || this.chain >= MAX_CHAIN) {
      return;
    }

    this.chain++;
    try {
      const done: string[] = [];

      for (const command of behaviour.commands) {
        const target = this.target(self, command.target);

        if (target) {
          this.apply(target, command);
          done.push(describeCommand(command));
        } else {
          done.push(
            `${describeCommand(command)} (no ${command.target.join(".")})`,
          );
        }
      }
      if (why !== "frame") {
        this.options.log?.(
          `${why}: ${done.join(", ") || "nothing to run"}` +
            (behaviour.skipped
              ? ` · ${behaviour.skipped} statement${behaviour.skipped === 1 ? "" : "s"} not run${behaviour.conditional ? " (conditional)" : ""}`
              : ""),
        );
      }
    } finally {
      this.chain--;
    }
  }

  private apply(target: Instance, command: TimelineCommand): void {
    switch (command.op) {
      case "goto": {
        const frame =
          command.label !== undefined
            ? this.labelFrame(target, command.label)
            : command.frame;

        if (frame !== undefined) {
          this.goTo(target, frame, command.play);
        }
        break;
      }
      case "play":
        target.playing = true;
        break;
      case "stop":
        target.playing = false;
        break;
      case "next":
      case "prev":
        this.goTo(
          target,
          target.frame + (command.op === "next" ? 1 : -1),
          false,
        );
        break;
    }
  }

  private target(self: Instance, path: string[]): Instance | undefined {
    let at: Instance | undefined = self;

    for (const part of path) {
      const lower = part.toLowerCase();

      if (lower === "_parent") {
        at = at?.parent;
        while (at && !isTimeline(at)) {
          at = at.parent;
        }
      } else if (lower === "_root") {
        at = this.root;
      } else if (lower !== "this") {
        at =
          at &&
          [...at.children.values()].find(
            (child) => child.name?.toLowerCase() === lower,
          );
      }
    }
    return at && isTimeline(at) ? at : undefined;
  }
}

export const describe = (instance: Instance): string =>
  (instance.name ? `"${instance.name}" ` : "") +
  `#${instance.id}${instance.path ? " @" + instance.path : ""}`;

const describeCommand = (command: TimelineCommand): string => {
  const on = command.target.length ? ` on ${command.target.join(".")}` : "";

  if (command.op !== "goto") {
    return command.op + on;
  }

  const where =
    command.label !== undefined
      ? `"${command.label}"`
      : `frame ${command.frame}`;

  return `${command.play ? "gotoAndPlay" : "gotoAndStop"} ${where}${on}`;
};
