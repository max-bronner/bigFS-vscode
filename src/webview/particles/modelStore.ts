import type { W3dAnimation } from '../../formats/w3d/w3dAnimation';
import type { ModelScene, SceneSkeleton } from '../../formats/w3d/w3dScene';
import { countTextureBytes, createSceneReceiver } from '../../formats/w3d/w3dSceneTransfer';
import type { SentScene } from '../../formats/w3d/w3dSceneTransfer';
import type { TextureLayers } from '../../formats/w3d/w3dTextureSwaps';
import type { DetailLevel } from '../../game/objects/detailModels';
import { releaseTextures, uploadTextures } from '../shared/uploadTextures';
import { post, viewer } from './page';

export interface ModelLook {
  name: string;
  textures?: TextureLayers;
  detail?: DetailLevel;
}

export interface LoadedClip {
  animation: W3dAnimation;
  skeleton?: SceneSkeleton;
}

interface StoredModel {
  scene: ModelScene | null;
  error?: string;
  uploaded: WebGLTexture[];
}

const MAX_MODELS = 160;

const store = {
  receiver: createSceneReceiver(),
  models: new Map<string, StoredModel>(),
  modelsAsked: new Set<string>(),
  clips: new Map<string, LoadedClip | null>(),
  clipsAsked: new Set<string>(),
  listeners: [] as (() => void)[],
};

export const getLookKey = ({ name, textures, detail }: ModelLook): string =>
  `${name}${detail ? `#${detail}` : ''}${textures?.length ? JSON.stringify(textures) : ''}`.toLowerCase();

const notify = () => store.listeners.forEach((listener) => listener());

export const onStoreChanged = (listener: () => void): void => {
  store.listeners.push(listener);
};

export const findModel = (key: string): ModelScene | null | undefined => {
  const found = store.models.get(key);

  if (found) {
    store.models.delete(key);
    store.models.set(key, found);
  }
  return found?.scene;
};

export const getModelError = (key: string): string | undefined => store.models.get(key)?.error;

export const loadModel = (look: ModelLook): void => {
  const key = getLookKey(look);

  if (!store.models.has(key) && !store.modelsAsked.has(key)) {
    store.modelsAsked.add(key);
    post({ kind: 'loadPartModel', ...look });
  }
};

export const receiveModel = (look: ModelLook, sent: SentScene | undefined, error?: string): void => {
  const key = getLookKey(look);
  const { gl } = viewer;
  const scene = sent ? store.receiver.receive(sent) : null;
  const uploaded = gl && scene ? uploadTextures(gl, scene) : [];
  const before = store.models.get(key);

  store.modelsAsked.delete(key);
  store.models.delete(key);
  store.models.set(key, { scene, error, uploaded });
  if (gl && before) {
    releaseTextures(gl, before.uploaded);
  }
  for (const [oldest, { uploaded: held }] of store.models) {
    if (store.models.size <= MAX_MODELS) {
      break;
    }
    store.models.delete(oldest);
    if (gl) {
      releaseTextures(gl, held);
    }
  }
  notify();
};

export const findClip = (name: string): LoadedClip | null | undefined =>
  store.clips.get(name.toLowerCase());

export const loadClip = (name: string): void => {
  const key = name.toLowerCase();

  if (!store.clips.has(key) && !store.clipsAsked.has(key)) {
    store.clipsAsked.add(key);
    post({ kind: 'loadPartAnimation', name });
  }
};

export const receiveClip = (
  name: string,
  animation: W3dAnimation | undefined,
  skeleton: SceneSkeleton | undefined,
): void => {
  store.clipsAsked.delete(name.toLowerCase());
  store.clips.set(name.toLowerCase(), animation ? { animation, skeleton } : null);
  notify();
};

export const isLoading = (): boolean => store.modelsAsked.size + store.clipsAsked.size > 0;

export const getHeldBytes = (): number =>
  countTextureBytes([...store.models.values()].flatMap(({ scene }) => (scene ? [scene] : [])));

export const forgetTextures = (): void => {
  store.receiver.reset();
};

export const forgetLoaded = (): void => {
  const { gl } = viewer;

  if (gl) {
    store.models.forEach(({ uploaded }) => releaseTextures(gl, uploaded));
  }
  store.receiver.reset();
  store.models.clear();
  store.modelsAsked.clear();
  store.clips.clear();
  store.clipsAsked.clear();
  notify();
};
