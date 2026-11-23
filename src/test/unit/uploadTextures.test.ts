import * as assert from 'assert';
import * as path from 'path';
import * as vm from 'vm';
import { buildSync } from 'esbuild';
import type { SceneTexture } from '../../formats/w3d/w3dSceneDraws';

interface UploadModule {
  uploadTextures(gl: unknown, scene: { textures: SceneTexture[] }, onChange?: () => void): unknown[];
}

const loadUploads = (): UploadModule => {
  const [bundle] = buildSync({
    entryPoints: [path.join(__dirname, '../../../src/webview/shared/uploadTextures.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    write: false,
  }).outputFiles;
  const module = { exports: {} };

  vm.runInNewContext(bundle.text, {
    module,
    exports: module.exports,
    Uint8Array,
    Map,
    Set,
    WeakMap,
    Promise,
    Blob: class {},
    createImageBitmap: async () => ({ close: () => undefined }),
    OffscreenCanvas: class {
      public constructor(
        private readonly width: number,
        private readonly height: number,
      ) {}

      public getContext() {
        return {
          drawImage: () => undefined,
          getImageData: () => ({ data: new Uint8Array(this.width * this.height * 4).fill(128) }),
        };
      }
    },
  });
  return module.exports as UploadModule;
};

const createContext = () => {
  const known: Record<string, unknown> = {
    createTexture: () => ({}),
    isTexture: () => true,
  };

  return new Proxy(known, {
    get: (target, name: string) => target[name] ?? (() => undefined),
  });
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

suite('Texture uploads', () => {
  const { uploadTextures } = loadUploads();
  const mask = (): SceneTexture => ({
    width: 1,
    height: 1,
    pixels: new Uint8Array(4),
    luminanceJpeg: Uint8Array.of(0xff, 0xd8),
  });

  test('every model sharing a house colour mask redraws once its luminance is written', async () => {
    const gl = createContext();
    const image = mask();
    const redraws: string[] = [];

    uploadTextures(gl, { textures: [image] }, () => redraws.push('first'));
    uploadTextures(gl, { textures: [image] }, () => redraws.push('second'));
    await settle();
    assert.deepStrictEqual(redraws, ['first', 'second']);
  });

  test('a model shown after the mask was written waits for nothing', async () => {
    const gl = createContext();
    const image = mask();
    const redraws: string[] = [];

    uploadTextures(gl, { textures: [image] });
    await settle();
    uploadTextures(gl, { textures: [image] }, () => redraws.push('late'));
    await settle();
    assert.deepStrictEqual(redraws, []);
  });
});
