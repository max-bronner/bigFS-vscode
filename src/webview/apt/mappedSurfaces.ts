import { getVsCodeApi } from '../shared/vscodeApi';
import { storeTextures } from './movieLoads';
import type { FromPage, PageMappedImage, ToPage } from './protocol';

const vscode = getVsCodeApi<FromPage>();

const known = new Map<string, PageMappedImage | null>();
const asked = new Set<string>();
let queued: string[] = [];
let arrived: () => void = () => {};

export const onMappedImages = (run: () => void): void => {
  arrived = run;
};

export const mappedImage = (name: string): PageMappedImage | null | undefined => {
  const key = name.toLowerCase();

  if (!known.has(key) && !asked.has(key)) {
    asked.add(key);
    queued.push(name);
    queueMicrotask(() => {
      if (queued.length) {
        vscode.postMessage({ kind: 'mappedImages', names: queued });
        queued = [];
      }
    });
  }
  return known.get(key);
};

export const mappedImagesArrived = (
  data: Extract<ToPage, { kind: 'mappedImages' }>,
): void => {
  storeTextures(data.textures);
  for (const [name, image] of Object.entries(data.images)) {
    known.set(name.toLowerCase(), image);
  }
  arrived();
};
