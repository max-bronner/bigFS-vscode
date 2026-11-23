import type { ParticleDef } from '../../formats/particles/particleDef';
import type { Particle } from '../../formats/particles/particleSimulation';
import type { CameraBasis } from '../shared/orbitBasis';
import { BATCH_LIMIT } from '../../formats/particles/particleSimulation';
import { library, viewer, world } from './page';

const FLOATS = 15;
const CHUNK = 16000;

const SPRITE_VERTEX = `
attribute vec3 aPos; attribute vec2 aCorner; attribute float aSize; attribute float aAngle; attribute vec4 aColor; attribute vec4 aUv;
uniform mat4 uViewProj; uniform vec3 uRight; uniform vec3 uUp;
varying vec4 vColor; varying vec2 vUv;
void main() {
  float c = cos(aAngle); float s = sin(aAngle);
  vec2 r = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
  vec3 world = aPos + (uRight * r.x + uUp * r.y) * aSize;
  gl_Position = uViewProj * vec4(world, 1.0);
  vColor = aColor;
  vUv = aUv.xy + vec2(aCorner.x + 0.5, 0.5 - aCorner.y) * aUv.zw;
}`;
const SPRITE_FRAGMENT = `
precision mediump float;
uniform sampler2D uTexture; uniform float uAlphaTest;
varying vec4 vColor; varying vec2 vUv;
void main() {
  vec4 color = texture2D(uTexture, vUv) * vColor;
  if (uAlphaTest > 0.5 && color.a < 0.5) discard;
  gl_FragColor = color;
}`;
const { canvas, gl } = viewer;

const ATTRIBUTES = [
  ['aPos', 3, 0],
  ['aCorner', 2, 3],
  ['aSize', 1, 5],
  ['aAngle', 1, 6],
  ['aColor', 4, 7],
  ['aUv', 4, 11],
] as const;

const UNIFORM_NAMES = ['uViewProj', 'uRight', 'uUp', 'uAlphaTest', 'uTexture'] as const;

const setUp = (gl: WebGLRenderingContext) => {
  const compile = (vertex: string, fragment: string) => {
    const program = gl.createProgram()!;

    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type)!;

      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    return program;
  };
  const texture = (upload: () => void, magFilter = true) => {
    const handle = gl.createTexture()!;

    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    if (magFilter) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    upload();
    return handle;
  };
  const indices = new Uint16Array(CHUNK * 6);

  for (let i = 0; i < CHUNK; i++) {
    indices.set(
      [i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3],
      i * 6,
    );
  }

  const indexBuffer = gl.createBuffer()!;

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  const spriteData = new Float32Array(CHUNK * 4 * FLOATS);
  const spriteBuffer = gl.createBuffer()!;

  gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, spriteData.byteLength, gl.DYNAMIC_DRAW);

  const size = 64;
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
      const a = Math.max(0, 1 - d);
      const v = Math.round(a * a * 255);

      pixels.set([v, v, v, v], (y * size + x) * 4);
    }
  }

  const spriteProgram = compile(SPRITE_VERTEX, SPRITE_FRAGMENT);
  const attributes = ATTRIBUTES.map(([name, size, offset]) => ({
    location: gl.getAttribLocation(spriteProgram, name),
    size,
    offset,
  }));
  const uniforms = Object.fromEntries(
    UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(spriteProgram, name)]),
  ) as Record<(typeof UNIFORM_NAMES)[number], WebGLUniformLocation | null>;

  return {
    spriteProgram,
    attributes,
    uniforms,
    spriteBuffer,
    spriteData,
    indexBuffer,
    makeTexture: (source: TexImageSource) =>
      texture(() =>
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          source,
        ),
      ),
    fallbackTexture: texture(
      () =>
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          size,
          size,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        ),
      false,
    ),
  };
};

const graphics = (() => {
  if (!gl) {
    return undefined;
  }
  try {
    return { gl, ...setUp(gl) };
  } catch (error) {
    console.error(error);
    return undefined;
  }
})();

export const hasGraphics = graphics !== undefined;

const textures = new Map<string, WebGLTexture>();
const loadedFrom = new Map<string, string>();

export const loadTextures = (sources: Record<string, string | null>): void => {
  if (!graphics) {
    return;
  }
  for (const [name, uri] of Object.entries(sources)) {
    if (!uri || loadedFrom.get(name) === uri) {
      continue;
    }
    loadedFrom.set(name, uri);
    if (!textures.has(name)) {
      textures.set(name, graphics.fallbackTexture);
    }

    const image = new Image();

    image.onload = () => {
      if (loadedFrom.get(name) !== uri) {
        return;
      }

      const before = textures.get(name);

      textures.set(name, graphics.makeTexture(image));
      if (before && before !== graphics.fallbackTexture) {
        graphics.gl.deleteTexture(before);
      }
    };
    image.src = uri;
  }
};

export const drawStats = { drawn: 0, fill: 0 };

const BLENDS: Record<string, (gl: WebGLRenderingContext) => number> = {
  ADDITIVE: (gl) => {
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    return 0;
  },
  ALPHA: (gl) => {
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    return 0;
  },
  ALPHA_TEST: (gl) => {
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.depthMask(true);
    return 1;
  },
  MULTIPLY: (gl) => {
    gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    gl.depthMask(false);
    return 0;
  },
};

const computeFlipbookUv = (
  book: ParticleDef['flipbook'],
  particle: Particle,
  blend: number,
): [number, number, number, number] => {
  if (!book) {
    return [0, 0, 1, 1];
  }

  const perRow = Math.max(1, book.framesPerRow);
  const total = Math.max(1, book.totalFrames);
  const rows = Math.max(1, Math.ceil(total / perRow));
  const age = Math.max(0, particle.age - 1 + blend);
  const cell =
    Math.floor((particle.sheetStart % total) + age * book.speed) % total;

  return [
    (cell % perRow) / perRow,
    (Math.floor(cell / perRow) % rows) / rows,
    1 / perRow,
    1 / rows,
  ];
};

const CORNERS = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
];

export const drawSystems = (
  matrix: Float32Array,
  basis: CameraBasis,
  blend: number,
): void => {
  if (!graphics) {
    return;
  }

  let covered = 0;
  let drawn = 0;
  const {
    gl,
    spriteProgram,
    spriteBuffer,
    spriteData,
    indexBuffer,
    uniforms,
  } = graphics;
  const order = world.systems
    .map((system) => {
      const d = system.origin.map(
        (o, i) => o - basis.eye[i],
      ) as typeof basis.eye;

      return {
        system,
        def: library.systems.get(system.name.toLowerCase()),
        distance: d[0] * d[0] + d[1] * d[1] + d[2] * d[2],
      };
    })
    .filter((entry) => entry.def && entry.system.particles.length)
    .sort((a, b) => b.distance - a.distance);

  gl.useProgram(spriteProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuffer);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);

  const attributes = graphics.attributes.map(({ location, size, offset }) => {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      size,
      gl.FLOAT,
      false,
      FLOATS * 4,
      offset * 4,
    );
    return location;
  });

  gl.uniformMatrix4fv(uniforms.uViewProj, false, matrix);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);

  for (const { system, def } of order) {
    const marker = def!.type === 'DRAWABLE';
    const flat = def!.groundAligned;

    gl.uniform3fv(uniforms.uRight, flat ? [-2, 0, 0] : basis.right);
    gl.uniform3fv(uniforms.uUp, flat ? [0, 2, 0] : basis.up);
    gl.uniform1f(
      uniforms.uAlphaTest,
      (BLENDS[def!.shader] ?? BLENDS.ADDITIVE)(gl),
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(
      gl.TEXTURE_2D,
      (!marker &&
        def!.particleName &&
        textures.get(def!.particleName.toLowerCase())) ||
        graphics.fallbackTexture,
    );
    gl.uniform1i(uniforms.uTexture, 0);

    const readsAlpha = def!.shader !== 'ADDITIVE';
    const particles = system.particles.slice(0, BATCH_LIMIT);

    drawn += particles.length;
    for (let first = 0; first < particles.length; first += CHUNK) {
      const batch = particles.slice(first, first + CHUNK);

      batch.forEach((p, i) => {
        const x = p.previous[0] + (p.position[0] - p.previous[0]) * blend;
        const y = p.previous[1] + (p.position[1] - p.previous[1]) * blend;
        const z = p.previous[2] + (p.position[2] - p.previous[2]) * blend;
        const size = marker
          ? 6
          : p.previousSize + (p.size - p.previousSize) * blend;
        const angle = p.previousAngle + (p.angle - p.previousAngle) * blend;
        const depth =
          matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];

        if (depth > 0.001) {
          const pixels =
            (Math.max(0, size) * matrix[5] * canvas.height) / 2 / depth;

          covered += pixels * pixels;
        }

        const red = p.previousColor[0] + (p.color[0] - p.previousColor[0]) * blend;
        const green = p.previousColor[1] + (p.color[1] - p.previousColor[1]) * blend;
        const blue = p.previousColor[2] + (p.color[2] - p.previousColor[2]) * blend;
        const alpha =
          !readsAlpha
            ? 1
            : p.previousAlpha + (p.alpha - p.previousAlpha) * blend;
        const uv = computeFlipbookUv(def!.flipbook, p, blend);
        const drawnSize = Math.max(0, size);

        for (let c = 0; c < CORNERS.length; c++) {
          const at = (i * 4 + c) * FLOATS;

          spriteData[at] = x;
          spriteData[at + 1] = y;
          spriteData[at + 2] = z;
          spriteData[at + 3] = CORNERS[c][0];
          spriteData[at + 4] = CORNERS[c][1];
          spriteData[at + 5] = drawnSize;
          spriteData[at + 6] = angle;
          spriteData[at + 7] = red;
          spriteData[at + 8] = green;
          spriteData[at + 9] = blue;
          spriteData[at + 10] = marker ? 1 : alpha;
          spriteData[at + 11] = uv[0];
          spriteData[at + 12] = uv[1];
          spriteData[at + 13] = uv[2];
          spriteData[at + 14] = uv[3];
        }
      });
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        spriteData.subarray(0, batch.length * 4 * FLOATS),
      );
      gl.drawElements(gl.TRIANGLES, batch.length * 6, gl.UNSIGNED_SHORT, 0);
    }
  }
  attributes.forEach((location) => gl.disableVertexAttribArray(location));
  gl.depthMask(true);
  drawStats.drawn = drawn;
  drawStats.fill = covered / Math.max(1, canvas.width * canvas.height);
};
