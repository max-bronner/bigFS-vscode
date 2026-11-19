import type { PlaySoundRequest, SoundReply } from '../../core/soundClip';

export interface SoundState {
  phase: 'idle' | 'loading' | 'playing' | 'blocked';
  name?: string;
  error?: string;
}

export interface SoundBackend {
  unlock(): void;
  decode(bytes: Uint8Array): Promise<unknown>;
  start(
    decoded: unknown,
    onEnded: () => void,
  ): Promise<{ stop(): void } | undefined>;
}

export interface SoundClick {
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface SoundPlayer {
  state(): SoundState;
  subscribe(listener: (state: SoundState) => void): () => void;
  unlock(): void;
  begin(name: string): number;
  request(name: string, post: (request: PlaySoundRequest) => void): void;
  press(
    name: string,
    click: SoundClick,
    post: (request: PlaySoundRequest) => void,
  ): void;
  receive(reply: SoundReply): Promise<void>;
  stop(): void;
}

const decodeBase64 = (text: string): Uint8Array => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);

  for (let at = 0; at < binary.length; at++) {
    bytes[at] = binary.charCodeAt(at);
  }
  return bytes;
};

export const createSoundPlayer = (backend: SoundBackend): SoundPlayer => {
  let state: SoundState = { phase: 'idle' };
  let pending = 0;
  let playing: { stop(): void } | undefined;
  const listeners = new Set<(state: SoundState) => void>();

  const setState = (next: SoundState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };

  const stop = () => {
    pending++;
    const handle = playing;

    playing = undefined;
    handle?.stop();
    if (state.phase !== 'idle') {
      setState({ phase: 'idle', name: state.name });
    }
  };

  const begin = (name: string) => {
    stop();
    setState({ phase: 'loading', name });
    return pending;
  };

  const request: SoundPlayer['request'] = (name, post) => {
    post({ kind: 'playSound', name, id: begin(name) });
  };

  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unlock: () => backend.unlock(),
    begin,
    request,
    stop,
    press: (name, click, post) => {
      if (click.ctrlKey || click.metaKey) {
        post({ kind: 'playSound', name, open: true });
      } else if (
        state.name === name &&
        (state.phase === 'loading' || state.phase === 'playing')
      ) {
        stop();
      } else {
        backend.unlock();
        request(name, post);
      }
    },
    receive: async (reply) => {
      if (reply.id !== pending || state.phase !== 'loading') {
        return;
      }
      if (!reply.clip) {
        setState({
          phase: 'idle',
          name: reply.name,
          error: reply.error ?? `${reply.name} names no sound`,
        });
        return;
      }

      const mine = pending;

      try {
        const decoded = await backend.decode(decodeBase64(reply.clip.data));

        if (mine !== pending) {
          return;
        }

        let handle: { stop(): void } | undefined;

        handle = await backend.start(decoded, () => {
          if (playing === handle && mine === pending) {
            playing = undefined;
            setState({ phase: 'idle', name: reply.name });
          }
        });

        if (mine !== pending) {
          handle?.stop();
          return;
        }
        if (!handle) {
          setState({ phase: 'blocked', name: reply.name });
          return;
        }
        playing = handle;
        setState({ phase: 'playing', name: reply.name });
      } catch (error) {
        if (mine === pending) {
          setState({
            phase: 'idle',
            name: reply.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
  };
};
