import type { Matrix4 } from '../../game/objects/placeComposedParts';
import type { DecalBlend } from '../../game/objects/objectShadows';

const VERTEX = `
attribute vec3 aPos; attribute vec2 aUv; uniform mat4 uViewProj; varying vec2 vUv;
void main() { gl_Position = uViewProj * vec4(aPos, 1.0); vUv = aUv; }`;
const FRAGMENT = `
precision mediump float; varying vec2 vUv;
uniform sampler2D uTexture; uniform vec4 uTint; uniform int uMode;
void main() {
  if (uMode == 0) {
    float edge = 1.0 - smoothstep(0.7, 1.0, length(vUv * 2.0 - 1.0));
    gl_FragColor = vec4(uTint.rgb, uTint.a * edge);
    return;
  }
  vec4 texel = texture2D(uTexture, vUv);
  if (uMode == 1) gl_FragColor = vec4(mix(vec3(1.0), texel.rgb, uTint.a), 1.0);
  else if (uMode == 2) gl_FragColor = vec4(texel.rgb, texel.a * uTint.a);
  else gl_FragColor = vec4(texel.rgb * uTint.a, 1.0);
}`;
const MODES: Record<DecalBlend, number> = { multiply: 1, alpha: 2, additive: 3 };
const DECAL_LIFT = 0.05;

export interface PlacedDecal {
  blend: DecalBlend;
  texture: WebGLTexture;
  centre: readonly [number, number];
  facing: number;
  width: number;
  depth: number;
  opacity: number;
}

export interface GroundRenderer {
  drawGround(
    matrix: Matrix4,
    centre: readonly [number, number],
    radius: number,
    colour: readonly [number, number, number],
  ): void;
  drawDecal(matrix: Matrix4, decal: PlacedDecal): void;
  loadTexture(url: string): Promise<WebGLTexture | null>;
}

const compile = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)!;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'ground shader');
  }
  return shader;
};

export const createGroundRenderer = (gl: WebGLRenderingContext): GroundRenderer => {
  const program = gl.createProgram()!;

  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'ground program');
  }

  const buffer = gl.createBuffer()!;
  const position = gl.getAttribLocation(program, 'aPos');
  const uv = gl.getAttribLocation(program, 'aUv');
  const uniforms = {
    viewProj: gl.getUniformLocation(program, 'uViewProj'),
    texture: gl.getUniformLocation(program, 'uTexture'),
    tint: gl.getUniformLocation(program, 'uTint'),
    mode: gl.getUniformLocation(program, 'uMode'),
  };

  const drawQuad = (
    matrix: Matrix4,
    [x, y]: readonly [number, number],
    z: number,
    facing: number,
    halfWidth: number,
    halfDepth: number,
    isTopDown: boolean,
  ) => {
    const [cos, sin] = [Math.cos(facing), Math.sin(facing)];
    const corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].flatMap(([u, v]) => [
      x + u * halfWidth * cos - v * halfDepth * sin,
      y + u * halfWidth * sin + v * halfDepth * cos,
      z,
      (u + 1) / 2,
      ((isTopDown ? -v : v) + 1) / 2,
    ]);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(position);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12);
    gl.uniformMatrix4fv(uniforms.viewProj, false, matrix);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(position);
    gl.disableVertexAttribArray(uv);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
  };

  return {
    drawGround: (matrix, centre, radius, [red, green, blue]) => {
      gl.useProgram(program);
      gl.uniform1i(uniforms.mode, 0);
      gl.uniform4f(uniforms.tint, red, green, blue, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      drawQuad(matrix, centre, 0, 0, radius, radius, false);
    },
    drawDecal: (matrix, { blend, texture, centre, facing, width, depth, opacity }) => {
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniforms.texture, 0);
      gl.uniform1i(uniforms.mode, MODES[blend]);
      gl.uniform4f(uniforms.tint, 1, 1, 1, opacity);
      gl.enable(gl.BLEND);
      if (blend === 'alpha') {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } else if (blend === 'additive') {
        gl.blendFunc(gl.ONE, gl.ONE);
      } else {
        gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      }
      drawQuad(matrix, centre, DECAL_LIFT, facing, width / 2, depth / 2, blend !== 'multiply');
    },
    loadTexture: (url) =>
      new Promise((resolve) => {
        const image = new Image();

        image.onload = () => {
          const texture = gl.createTexture()!;

          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          resolve(texture);
        };
        image.onerror = () => resolve(null);
        image.src = url;
      }),
  };
};
