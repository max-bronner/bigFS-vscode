import type { ModelScene } from '../../formats/w3d/w3dScene';

export interface RenderObject {
  name: string;
  scene: ModelScene;
  frame: number;
  isResting: boolean;
  tick: number;
  pass: number;
}

export interface RenderObjectHost {
  ask(name: string): void;
  release(object: RenderObject): void;
}

export const MAX_RENDER_OBJECTS = 16;

export type RenderObjectState =
  | { object: RenderObject }
  | { pending: true }
  | { unavailable: string };

export interface RenderObjectCache {
  get(name: string, pass: number): RenderObjectState;
  arrive(name: string, scene: ModelScene): void;
  fail(name: string, reason: string): void;
}

export const createRenderObjectCache = (
  host: RenderObjectHost,
): RenderObjectCache => {
  const held = new Map<string, RenderObject>();
  const failed = new Map<string, string>();
  const waiting: string[] = [];
  let asking: string | undefined;

  const askNext = () => {
    if (asking === undefined && waiting.length) {
      asking = waiting.shift()!;
      host.ask(asking);
    }
  };

  const makeRoom = (pass: number): boolean => {
    if (held.size + waiting.length + (asking === undefined ? 0 : 1) < MAX_RENDER_OBJECTS) {
      return true;
    }

    const idle = [...held.values()]
      .filter((each) => each.pass < pass - 1)
      .sort((a, b) => a.pass - b.pass)[0];

    if (!idle) {
      return false;
    }
    held.delete(idle.name.toLowerCase());
    host.release(idle);
    return true;
  };

  const settle = (key: string) => {
    if (key === asking) {
      asking = undefined;
    }
    askNext();
  };

  return {
    get(name, pass) {
      const key = name.toLowerCase();
      const object = held.get(key);

      if (object) {
        return { object };
      }

      const reason = failed.get(key);

      if (reason !== undefined) {
        return { unavailable: reason };
      }
      if (key === asking || waiting.includes(key)) {
        return { pending: true };
      }
      if (!makeRoom(pass)) {
        return {
          unavailable: `${MAX_RENDER_OBJECTS} models are already shown`,
        };
      }
      waiting.push(key);
      askNext();
      return { pending: true };
    },
    arrive(name, scene) {
      const key = name.toLowerCase();

      held.set(key, { name, scene, frame: 0, isResting: false, tick: 0, pass: 0 });
      settle(key);
    },
    fail(name, reason) {
      const key = name.toLowerCase();

      failed.set(key, reason);
      settle(key);
    },
  };
};
