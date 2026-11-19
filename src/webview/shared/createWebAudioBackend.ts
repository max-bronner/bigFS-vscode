import type { SoundBackend } from './createSoundPlayer';

const SUSPENDED_WAIT_MS = 300;

export const createWebAudioBackend = (): SoundBackend => {
  let context: AudioContext | undefined;

  const getContext = () => (context ??= new AudioContext());

  return {
    unlock: () => {
      void getContext().resume();
    },
    decode: (bytes) =>
      getContext().decodeAudioData(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      ),
    start: async (decoded, onEnded) => {
      const audio = getContext();

      await Promise.race([
        audio.resume(),
        new Promise((resolve) => setTimeout(resolve, SUSPENDED_WAIT_MS)),
      ]);
      if (audio.state !== 'running') {
        return undefined;
      }

      const source = audio.createBufferSource();

      source.buffer = decoded as AudioBuffer;
      source.connect(audio.destination);
      source.onended = onEnded;
      source.start();
      return {
        stop: () => {
          source.onended = null;
          try {
            source.stop();
          } catch {
          }
        },
      };
    },
  };
};
