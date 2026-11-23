import * as assert from 'assert';
import * as path from 'path';
import * as vm from 'vm';
import { buildSync } from 'esbuild';

interface GroundModule {
  createGroundRenderer(gl: unknown): {
    drawGround(matrix: number[], centre: [number, number], radius: number, colour: [number, number, number]): void;
    drawDecal(matrix: number[], decal: unknown): void;
    loadTexture(url: string): Promise<unknown>;
  };
}

class BrokenImage {
  public onerror: (() => void) | undefined;

  public set src(_url: string) {
    setTimeout(() => this.onerror?.());
  }
}

const loadGround = (): GroundModule => {
  const [bundle] = buildSync({
    entryPoints: [path.join(__dirname, '../../../src/webview/particles/groundRenderer.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'neutral',
    write: false,
  }).outputFiles;
  const module = { exports: {} };

  vm.runInNewContext(bundle.text, {
    module,
    exports: module.exports,
    Float32Array,
    Promise,
    Image: BrokenImage,
  });
  return module.exports as GroundModule;
};

const createContext = (links = true) => {
  const lookups: string[] = [];
  const known: Record<string, unknown> = {
    getShaderParameter: () => true,
    getProgramParameter: () => links,
    getProgramInfoLog: () => 'link failed',
    getAttribLocation: () => 0,
    getUniformLocation: (_program: unknown, name: string) => {
      lookups.push(name);
      return name;
    },
    createProgram: () => ({}),
    createShader: () => ({}),
    createBuffer: () => ({}),
  };
  const gl = new Proxy(known, {
    get: (target, name: string) => target[name] ?? (() => undefined),
  });

  return { gl, lookups };
};

const DECAL = {
  blend: 'alpha',
  texture: {},
  centre: [0, 0],
  facing: 0,
  width: 10,
  depth: 10,
  opacity: 1,
};

suite('Ground renderer', () => {
  const { createGroundRenderer } = loadGround();

  test('a program that does not link fails at once, not on the first frame', () => {
    assert.throws(() => createGroundRenderer(createContext(false).gl), /link failed/);
  });

  test('uniforms are looked up once, not for every quad', () => {
    const { gl, lookups } = createContext();
    const ground = createGroundRenderer(gl);
    const before = lookups.length;

    for (let frame = 0; frame < 3; frame++) {
      ground.drawGround([], [0, 0], 60, [0.5, 0.5, 0.5]);
      ground.drawDecal([], DECAL);
    }
    assert.strictEqual(lookups.length, before);
  });

  test('a decal image that does not decode comes back as none', async () => {
    const ground = createGroundRenderer(createContext().gl);

    assert.strictEqual(await ground.loadTexture('data:image/png;base64,AAAA'), null);
  });
});
