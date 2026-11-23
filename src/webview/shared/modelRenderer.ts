import {
  buildBoneLines,
  listAttachmentJoints,
  getMeshOpacity,
  isMeshShown,
  poseAt,
  skin,
} from "../../formats/w3d/w3dPose";
import type { Pose, Vec3 } from "../../formats/w3d/w3dPose";
import { getMeshVisibility } from "../../formats/w3d/w3dScene";
import type { VisibilityOptions } from "../../formats/w3d/w3dScene";
import type { ModelScene, SceneMesh } from "../../formats/w3d/w3dScene";
import type { SceneDraw } from "../../formats/w3d/w3dSceneDraws";
import { DEFAULT_SURFACE } from "../../formats/w3d/w3dMaterialTypes";
import type { W3dBlend, W3dSurface } from "../../formats/w3d/w3dMaterialTypes";
import { parseUvMapper, sampleBumpMatrix, UV_MAPPER } from "../../formats/w3d/w3dUvMapper";
import { DEFAULT_HOUSE_COLOUR } from "../../formats/w3d/w3dHouseColour";
import { applyBlend } from "./applyBlend";
import { applyMapper, DETAIL_UV_UNIFORMS, UV_UNIFORMS } from "./applyMapper";
import { applySurface } from "./applySurface";
import { bindAttribute } from "./bindAttribute";
import { bindColors } from "./bindColors";
import { bindSolid, drawModelLines } from "./drawModelLines";
import type { BoneLines } from "./drawModelLines";
import type { ModelAttributes } from "./modelLocations";
import { buildFragmentShader, VERTEX_SHADER } from "./modelShaders";
import { orderDraws } from "./orderDraws";
import { computeFacingAxes, turnVertices } from "../../formats/w3d/w3dFacing";
import { releaseTextures, uploadTextures } from "./uploadTextures";

const MISSING_TEXTURE = [0.7, 0.7, 0.7, 1];
const NO_TEXTURE = [1, 1, 1, 1];
const CLAY = [0.75, 0.73, 0.7, 1];
const SHADOW_COLOUR = [160 / 255, 160 / 255, 160 / 255, 1];

export interface DrawOptions {
  offset?: Vec3;
  light: Vec3;
  unlit?: boolean;
  showBones: boolean;
  showMeshes?: boolean;
  lod?: number;
  showHidden?: boolean;
  subObjectRules?: VisibilityOptions["subObjectRules"];
  partOverrides?: VisibilityOptions["partOverrides"];
  showBoxes?: boolean;
  seconds?: number;
  camera?: ModelCamera;
  houseColour?: Vec3 | null;
  showTextures?: boolean;
  isFloor?: boolean;
}

export interface ModelCamera {
  eye: Vec3;
  up?: Vec3;
  rotation: number[];
}

const DEFAULT_ROTATION = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const FAR_EYE = 1e5;

const programs = new WeakMap<WebGLRenderingContext, WebGLProgram>();

const getProgram = (gl: WebGLRenderingContext): WebGLProgram => {
  let program = programs.get(gl);

  if (!program) {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(
      program,
      compile(
        gl,
        gl.FRAGMENT_SHADER,
        buildFragmentShader(!!gl.getExtension("OES_standard_derivatives")),
      ),
    );
    gl.linkProgram(program);
    programs.set(gl, program);
  }
  return program;
};

export interface ModelRenderer {
  setModel(scene: ModelScene | undefined): void;
  setPose(pose: Pose | undefined): void;
  draw(viewProjection: Float32Array | number[], options: DrawOptions): void;
  drawShadow(viewProjection: Float32Array | number[], options: ShadowDrawOptions): void;
}

export type ShadowDrawOptions = Pick<
  DrawOptions,
  'offset' | 'lod' | 'subObjectRules' | 'partOverrides'
> & {
  heightPlane: readonly number[];
};

const ALPHA_CUTOFF = 96 / 255;

interface DrawablePart {
  count: number;
  surface: W3dSurface;
  indexType: number;
  texture?: WebGLTexture;
  namesTexture: boolean;
  detailTexture?: WebGLTexture;
  houseMask?: WebGLTexture;
  normalMap?: WebGLTexture;
  uv?: WebGLBuffer;
  detailUv?: WebGLBuffer;
  color?: WebGLBuffer;
  index: WebGLBuffer;
}

interface Drawable {
  mesh: number;
  hasNormals: boolean;
  position: WebGLBuffer;
  normal?: WebGLBuffer;
  parts: DrawablePart[];
  posed?: { positions: Float32Array; normals?: Float32Array };
  turned?: { positions: Float32Array; normals?: Float32Array };
}

const NO_MAPPER = parseUvMapper(UV_MAPPER.UV);

const getMaterialAlpha = ({ blend, opacity, vertexColour }: W3dSurface) =>
  blend === "alpha" && !vertexColour?.diffuse ? opacity : 1;

const getDraws = (mesh: SceneMesh): SceneDraw[] =>
  mesh.draws ?? [
    {
      pass: 0,
      surface: {
        ...DEFAULT_SURFACE,
        blend: mesh.blend,
        alphaTest: mesh.alphaTest,
        twoSided: true,
      },
      texture: mesh.texture,
      textured: mesh.texture !== undefined,
      uvs: mesh.uvs,
    },
  ];

const compile = (
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader => {
  const shader = gl.createShader(type)!;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "shader");
  }
  return shader;
};

const bindPoses = new WeakMap<object, Pose>();
const poseAtBind = (skeleton: NonNullable<ModelScene["skeleton"]>): Pose => {
  let pose = bindPoses.get(skeleton);

  if (!pose) {
    pose = poseAt(skeleton);
    bindPoses.set(skeleton, pose);
  }
  return pose;
};

export const createModelRenderer = (
  gl: WebGLRenderingContext,
  onTexturesChanged?: () => void,
): ModelRenderer => {
  const program = getProgram(gl);

  const wideIndices = !!gl.getExtension("OES_element_index_uint");
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const uniform = (name: string) => {
    if (!uniforms.has(name)) {
      uniforms.set(name, gl.getUniformLocation(program, name));
    }
    return uniforms.get(name)!;
  };
  const attributes: ModelAttributes = {
    position: gl.getAttribLocation(program, "position"),
    normal: gl.getAttribLocation(program, "normal"),
    uv: gl.getAttribLocation(program, "uv"),
    detailUv: gl.getAttribLocation(program, "detailUv"),
    color: gl.getAttribLocation(program, "color"),
  };
  const boneBuffer = gl.createBuffer()!;
  const boxBuffer = gl.createBuffer()!;
  let boxVertices = 0;

  let scene: ModelScene | undefined;
  let drawables: Drawable[] = [];
  let textures: WebGLTexture[] = [];
  let pose: Pose | undefined;
  let buffers = new Set<WebGLBuffer>();
  let arrayBuffers = new Map<ArrayBufferLike, Map<string, WebGLBuffer>>();

  const uploadBuffer = (
    target: number,
    data: ArrayBufferView,
    usage: number = gl.STATIC_DRAW,
  ) => {
    const made = gl.createBuffer()!;

    gl.bindBuffer(target, made);
    gl.bufferData(target, data as BufferSource, usage);
    buffers.add(made);
    return made;
  };

  const release = () => {
    for (const buffer of buffers) {
      gl.deleteBuffer(buffer);
    }
    releaseTextures(gl, textures);
    buffers = new Set();
    arrayBuffers = new Map();
    drawables = [];
    textures = [];
  };

  const uploadOnce = (data: Float32Array | Uint8Array) => {
    const key = `${data.byteOffset}:${data.byteLength}`;
    const known = arrayBuffers.get(data.buffer) ?? new Map<string, WebGLBuffer>();
    let made = known.get(key);

    if (!made) {
      made = uploadBuffer(gl.ARRAY_BUFFER, data);
      known.set(key, made);
      arrayBuffers.set(data.buffer, known);
    }
    return made;
  };

  const setModel = (next: ModelScene | undefined) => {
    release();
    scene = next;
    pose = undefined;
    if (!next) {
      return;
    }

    textures = uploadTextures(gl, next, onTexturesChanged);

    const boxLines = Float32Array.from(
      next.boxes.flatMap((box) => Array.from(box.lines)),
    );

    boxVertices = boxLines.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, boxLines, gl.STATIC_DRAW);

    drawables = next.meshes.flatMap((mesh, at): Drawable[] => {
      const vertices = mesh.positions.length / 3;
      const narrow = vertices <= 0x10000;

      if (!narrow && !wideIndices) {
        return [];
      }

      const usage = mesh.local || mesh.facing ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
      const uploadIndices = (indices: Uint32Array) =>
        uploadBuffer(
          gl.ELEMENT_ARRAY_BUFFER,
          narrow ? Uint16Array.from(indices) : indices,
        );
      let wholeMeshIndex: WebGLBuffer | undefined;
      const getIndexBuffer = (indices?: Uint32Array) => {
        if (indices) {
          return uploadIndices(indices);
        }
        wholeMeshIndex ??= uploadIndices(mesh.indices);
        return wholeMeshIndex;
      };

      return [
        {
          mesh: at,
          hasNormals: !!mesh.normals,
          position: uploadBuffer(gl.ARRAY_BUFFER, mesh.positions, usage),
          normal: mesh.normals && uploadBuffer(gl.ARRAY_BUFFER, mesh.normals, usage),
          parts: getDraws(mesh).map((draw): DrawablePart => ({
            count: (draw.indices ?? mesh.indices).length,
            surface: draw.surface,
            indexType: narrow ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
            texture:
              draw.uvs && draw.texture !== undefined
                ? textures[draw.texture]
                : undefined,
            detailTexture:
              draw.detailUvs && draw.detailTexture !== undefined
                ? textures[draw.detailTexture]
                : undefined,
            houseMask:
              draw.uvs && draw.houseMask !== undefined ? textures[draw.houseMask] : undefined,
            normalMap:
              draw.uvs && draw.normalMap !== undefined ? textures[draw.normalMap] : undefined,
            uv: draw.uvs && uploadOnce(draw.uvs),
            detailUv: draw.detailUvs && uploadOnce(draw.detailUvs),
            color: draw.colors && uploadOnce(draw.colors),
            index: getIndexBuffer(draw.indices),
            namesTexture: draw.textured,
          })),
          turned: mesh.facing && {
            positions: new Float32Array(mesh.positions.length),
            normals: mesh.normals && new Float32Array(mesh.normals.length),
          },
          posed: mesh.local && {
            positions: new Float32Array(mesh.positions.length),
            normals: mesh.normals && new Float32Array(mesh.normals.length),
          },
        },
      ];
    });
  };

  const setPose = (next: Pose | undefined) => {
    pose = next;
    if (!scene) {
      return;
    }
    for (const drawable of drawables) {
      const mesh = scene.meshes[drawable.mesh];

      if (!drawable.posed) {
        continue;
      }
      if (next) {
        skin(mesh, next, drawable.posed.positions, drawable.posed.normals);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, drawable.position);
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        next ? drawable.posed.positions : mesh.positions,
      );
      if (drawable.normal && mesh.normals) {
        gl.bindBuffer(gl.ARRAY_BUFFER, drawable.normal);
        gl.bufferSubData(
          gl.ARRAY_BUFFER,
          0,
          (next && drawable.posed.normals) || mesh.normals,
        );
      }
    }
  };

  const turnToCamera = (drawable: Drawable, { eye, rotation, up }: ModelCamera, offset: Vec3) => {
    const { facing, bone } = scene!.meshes[drawable.mesh];
    const { turned } = drawable;

    if (!facing || !turned) {
      return;
    }

    const posedAt = bone === undefined ? undefined : pose?.world[bone]?.t;
    const origin: Vec3 = posedAt ? [posedAt[0], posedAt[1], posedAt[2]] : facing.origin;
    const axes = computeFacingAxes(facing.kind, origin, {
      eye: [eye[0] - offset[0], eye[1] - offset[1], eye[2] - offset[2]],
      backward: [rotation[2], rotation[5], rotation[8]],
      up: up ?? [0, 0, 1],
    });

    turnVertices(facing.stored, origin, axes, turned.positions, turned.normals);
    gl.bindBuffer(gl.ARRAY_BUFFER, drawable.position);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, turned.positions);
    if (drawable.normal && turned.normals) {
      gl.bindBuffer(gl.ARRAY_BUFFER, drawable.normal);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, turned.normals);
    }
  };

  const bindTexture = (texture: WebGLTexture | undefined, name: string, unit: number) => {
    if (texture) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform(name), unit);
    }
  };

  const drawShadow = (
    viewProjection: Float32Array | number[],
    { offset = [0, 0, 0], lod, subObjectRules, partOverrides, heightPlane }: ShadowDrawOptions,
  ) => {
    if (!scene) {
      return;
    }

    const { meshes } = scene;
    const visible = getMeshVisibility(scene, { lod, subObjectRules, partOverrides });

    gl.useProgram(program);
    gl.uniformMatrix4fv(uniform("viewProjection"), false, viewProjection);
    gl.uniform3fv(uniform("offset"), offset);
    gl.uniform4fv(uniform("heightPlane"), heightPlane);
    gl.uniform1i(uniform("clipsBelowGround"), 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
    gl.disable(gl.CULL_FACE);
    for (const drawable of drawables) {
      const mesh = meshes[drawable.mesh];
      const isSolid = mesh.blend === "opaque" && !mesh.alphaTest && !mesh.facing;

      if (
        !visible[drawable.mesh] ||
        mesh.pickProxy ||
        (!isSolid && !mesh.castsShadow) ||
        (pose && !isMeshShown(mesh, pose))
      ) {
        continue;
      }
      bindSolid(gl, { uniform, attributes }, SHADOW_COLOUR, drawable.position);
      for (const part of drawable.parts) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.index);
        gl.drawElements(gl.TRIANGLES, part.count, part.indexType, 0);
      }
    }
    applyBlend(gl, "opaque", true);
    gl.depthFunc(gl.LESS);
    gl.uniform1i(uniform("clipsBelowGround"), 0);
  };

  const draw = (
    viewProjection: Float32Array | number[],
    {
      offset = [0, 0, 0],
      light,
      unlit,
      showBones,
      showMeshes = true,
      lod,
      showHidden,
      subObjectRules,
      partOverrides,
      showBoxes,
      seconds = 0,
      camera,
      houseColour = DEFAULT_HOUSE_COLOUR,
      showTextures = true,
      isFloor = false,
    }: DrawOptions,
  ) => {
    if (!scene) {
      return;
    }
    gl.useProgram(program);
    gl.uniformMatrix4fv(uniform("viewProjection"), false, viewProjection);
    gl.uniform3fv(uniform("offset"), offset);
    gl.uniform3fv(uniform("lightDirection"), light);
    gl.uniform3fv(uniform("houseColour"), houseColour ?? DEFAULT_HOUSE_COLOUR);
    gl.uniform3fv(uniform("eye"), camera?.eye ?? light.map((axis) => axis * FAR_EYE));
    gl.uniformMatrix3fv(
      uniform("viewRotation"),
      false,
      camera?.rotation ?? DEFAULT_ROTATION,
    );
    gl.uniform1i(uniform("useSolid"), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    if (camera) {
      for (const drawable of drawables) {
        turnToCamera(drawable, camera, offset as Vec3);
      }
    }

    const { meshes } = scene;
    const visible = getMeshVisibility(scene, {
      lod,
      showHidden,
      subObjectRules,
      partOverrides,
    });
    const opacityOf = (each: Drawable) =>
      pose ? getMeshOpacity(meshes[each.mesh], pose) : 1;
    const blendOf = (drawable: Drawable, { surface }: DrawablePart): W3dBlend =>
      isFloor || (surface.blend === "opaque" && opacityOf(drawable) < 1) ? "alpha" : surface.blend;
    const shown = showMeshes
      ? drawables
          .filter(
            (each) =>
              visible[each.mesh] && (!pose || isMeshShown(meshes[each.mesh], pose)),
          )
          .flatMap((drawable) =>
            drawable.parts.map((part) => ({
              drawable,
              part,
              blend: blendOf(drawable, part),
              sortLevel: part.surface.sortLevel,
            })),
          )
      : [];

    for (const { drawable, part, blend } of orderDraws(shown)) {
      applyBlend(
        gl,
        blend,
        !isFloor &&
          (blend === "opaque" || (part.surface.blend !== "opaque" && part.surface.depthWrite)),
      );
      applySurface(gl, uniform, part.surface);
      if (isFloor) {
        gl.depthFunc(gl.LEQUAL);
      }
      applyMapper(gl, uniform, UV_UNIFORMS, part.surface.mappers?.[0], seconds, drawable.hasNormals);
      applyMapper(
        gl,
        uniform,
        DETAIL_UV_UNIFORMS,
        part.surface.mappers?.[1],
        seconds,
        drawable.hasNormals,
      );
      gl.uniform4fv(
        uniform("bumpMatrix"),
        sampleBumpMatrix(part.surface.mappers?.[0] ?? NO_MAPPER, seconds),
      );
      gl.uniform1f(uniform("opacity"), opacityOf(drawable));
      gl.uniform1i(uniform("fadesColour"), blend === "alpha" ? 0 : 1);
      gl.uniform1i(uniform("writesOpaque"), blend === "opaque" ? 1 : 0);
      gl.uniform1f(uniform("materialAlpha"), getMaterialAlpha(part.surface));
      gl.uniform1f(
        uniform("alphaCutoff"),
        part.surface.alphaTest ? ALPHA_CUTOFF : -1,
      );
      const texture = showTextures ? part.texture : undefined;
      const houseMask = houseColour ? part.houseMask : undefined;
      const detail = !showTextures || part.houseMask ? undefined : part.detailTexture;

      gl.uniform1i(uniform("hasTexture"), texture ? 1 : 0);
      gl.uniform4fv(
        uniform("untextured"),
        !showTextures ? CLAY : part.namesTexture ? MISSING_TEXTURE : NO_TEXTURE,
      );
      gl.uniform1i(uniform("hasNormals"), drawable.hasNormals && !unlit ? 1 : 0);
      bindTexture(texture, "tex", 0);
      bindAttribute(gl, attributes.position, drawable.position, 3);
      bindAttribute(gl, attributes.normal, drawable.normal, 3);
      gl.uniform1i(uniform("hasDetail"), detail ? 1 : 0);
      bindTexture(detail, "detailTex", 1);
      gl.uniform1i(uniform("hasHouseMask"), houseMask ? 1 : 0);
      bindTexture(houseMask, "houseMaskTex", 2);
      gl.uniform1i(uniform("hasNormalMap"), part.normalMap && drawable.hasNormals ? 1 : 0);
      bindTexture(part.normalMap, "normalTex", 3);
      bindAttribute(gl, attributes.uv, part.uv, 2);
      bindAttribute(gl, attributes.detailUv, part.detailUv ?? part.uv, 2);
      bindColors(gl, attributes.color, part.color);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, part.index);
      gl.drawElements(gl.TRIANGLES, part.count, part.indexType, 0);
    }

    applyBlend(gl, "opaque", true);
    gl.depthFunc(gl.LESS);
    gl.disable(gl.CULL_FACE);

    const skeleton = scene.skeleton;
    const bonePose = skeleton && (pose ?? poseAtBind(skeleton));
    const bones: BoneLines = {
      buffer: boneBuffer,
      vertices:
        showBones && skeleton && bonePose ? buildBoneLines(skeleton, bonePose) : [],
      attachments:
        showBones && skeleton && bonePose
          ? listAttachmentJoints(skeleton, bonePose)
          : [],
    };

    drawModelLines(
      gl,
      { uniform, attributes },
      showBoxes ? { buffer: boxBuffer, vertexCount: boxVertices } : undefined,
      bones,
    );
    for (const location of Object.values(attributes)) {
      if (location >= 0) {
        gl.disableVertexAttribArray(location);
      }
    }
    gl.activeTexture(gl.TEXTURE0);
  };

  return { setModel, setPose, draw, drawShadow };
};
