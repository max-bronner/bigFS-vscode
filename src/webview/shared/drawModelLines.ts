import { bindAttribute } from "./bindAttribute";
import { bindColors } from "./bindColors";
import type { ModelLocations } from "./modelLocations";

const BOX_COLOUR = [0.3, 0.9, 0.5, 1];
const BONE_COLOUR = [1, 0.75, 0.2, 1];
const ATTACHMENT_COLOUR = [0.3, 0.85, 1, 1];
const JOINT_SIZE = 5;
const ATTACHMENT_SIZE = 10;

export interface BoxLines {
  buffer: WebGLBuffer;
  vertexCount: number;
}

export interface BoneLines {
  buffer: WebGLBuffer;
  vertices: number[];
  attachments: number[];
}

const bindSolid = (
  gl: WebGLRenderingContext,
  { uniform, attributes }: ModelLocations,
  colour: number[],
  positions: WebGLBuffer,
) => {
  gl.uniform1i(uniform("useSolid"), 1);
  gl.uniform4fv(uniform("solid"), colour);
  bindAttribute(gl, attributes.normal, undefined, 3);
  bindAttribute(gl, attributes.uv, undefined, 2);
  bindAttribute(gl, attributes.detailUv, undefined, 2);
  bindColors(gl, attributes.color, undefined);
  bindAttribute(gl, attributes.position, positions, 3);
};

export const drawModelLines = (
  gl: WebGLRenderingContext,
  locations: ModelLocations,
  boxes: BoxLines | undefined,
  bones: BoneLines | undefined,
): void => {
  if (boxes?.vertexCount) {
    bindSolid(gl, locations, BOX_COLOUR, boxes.buffer);
    gl.drawArrays(gl.LINES, 0, boxes.vertexCount);
  }
  if (bones?.vertices.length) {
    gl.disable(gl.DEPTH_TEST);
    gl.bindBuffer(gl.ARRAY_BUFFER, bones.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bones.vertices), gl.DYNAMIC_DRAW);
    bindSolid(gl, locations, BONE_COLOUR, bones.buffer);
    gl.drawArrays(gl.LINES, 0, bones.vertices.length / 3);
    gl.uniform1f(locations.uniform("pointSize"), JOINT_SIZE);
    gl.drawArrays(gl.POINTS, 0, bones.vertices.length / 3);
    if (bones.attachments.length) {
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bones.attachments), gl.DYNAMIC_DRAW);
      bindSolid(gl, locations, ATTACHMENT_COLOUR, bones.buffer);
      gl.uniform1f(locations.uniform("pointSize"), ATTACHMENT_SIZE);
      gl.drawArrays(gl.POINTS, 0, bones.attachments.length / 3);
    }
    gl.uniform1f(locations.uniform("pointSize"), 1);
    gl.enable(gl.DEPTH_TEST);
  }
};
