import { getVsCodeApi } from '../shared/vscodeApi';
import { storeTextures } from './movieLoads';
import type { FromPage, PageMappedImage, ToPage } from './protocol';
import { state } from './state';

const vscode = getVsCodeApi<FromPage>();

const known = new Map<string, PageMappedImage | null>();
const asked = new Set<string>();
let queued: string[] = [];
let arrived: () => void = () => {};

export const onMappedImages = (run: () => void): void => {
  arrived = run;
};

export const getMappedImage = (name: string): PageMappedImage | null | undefined => {
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

const storeJpegs = async (jpegs: Record<string, Uint8Array>): Promise<void> => {
  for (const [path, bytes] of Object.entries(jpegs)) {
    try {
      const bitmap = await createImageBitmap(
        new Blob([bytes as BlobPart], { type: 'image/jpeg' }),
      );
      const canvas = document.createElement('canvas');

      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      state.textures.set(path, canvas);
    } catch {
    }
  }
};

export const mappedImagesArrived = (
  data: Extract<ToPage, { kind: 'mappedImages' }>,
): void => {
  storeTextures(data.textures);
  for (const [name, image] of Object.entries(data.images)) {
    known.set(name.toLowerCase(), image);
  }
  arrived();
  void storeJpegs(data.jpegs ?? {}).then(arrived);
};
