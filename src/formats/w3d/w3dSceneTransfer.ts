import type { ModelScene } from "./w3dScene";
import type { SceneTexture } from "./w3dSceneDraws";

export interface SentTexture {
  id: number;
  image?: SceneTexture;
}

export interface SentScene extends Omit<ModelScene, "textures"> {
  textures: SentTexture[];
}

export const MAX_SENT_BYTES = 768 * 1024 * 1024;

export interface SceneSender {
  send(scene: ModelScene): { scene: SentScene; startsOver: boolean };
  reset(): void;
}

export const createSceneSender = (
  getDigest: (texture: SceneTexture) => string,
  maxBytes = MAX_SENT_BYTES,
): SceneSender => {
  let ids = new Map<string, number>();
  let sentBytes = 0;
  let nextId = 0;

  const reset = () => {
    ids = new Map();
    sentBytes = 0;
  };

  return {
    reset,
    send: (scene) => {
      const startsOver = sentBytes >= maxBytes;

      if (startsOver) {
        reset();
      }

      const textures = scene.textures.map((image): SentTexture => {
        const digest = getDigest(image);
        const known = ids.get(digest);

        if (known !== undefined) {
          return { id: known };
        }

        const id = nextId++;

        ids.set(digest, id);
        sentBytes += image.pixels.byteLength;
        return { id, image };
      });

      return { scene: { ...scene, textures }, startsOver };
    },
  };
};

export interface SceneReceiver {
  receive(scene: SentScene): ModelScene;
  reset(): void;
}

const BLANK: SceneTexture = { width: 1, height: 1, pixels: new Uint8Array(4) };

export const createSceneReceiver = (): SceneReceiver => {
  let images = new Map<number, SceneTexture>();

  return {
    reset: () => {
      images = new Map();
    },
    receive: (scene) => ({
      ...scene,
      textures: scene.textures.map(({ id, image }) => {
        if (image && !images.has(id)) {
          images.set(id, image);
        }
        return images.get(id) ?? BLANK;
      }),
    }),
  };
};

export const countTextureBytes = (scenes: Iterable<Pick<ModelScene, "textures">>): number => {
  const counted = new Set<SceneTexture>();
  let bytes = 0;

  for (const { textures } of scenes) {
    for (const image of textures) {
      if (!counted.has(image)) {
        counted.add(image);
        bytes += image.pixels.byteLength;
      }
    }
  }
  return bytes;
};
