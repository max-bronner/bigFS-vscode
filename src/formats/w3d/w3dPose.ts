import { sampleChannel } from './w3dAnimation';
import type { SampledChannel, W3dAnimation } from './w3dAnimation';
import type { SceneMesh, SceneSkeleton } from './w3dScene';
import { skinVertices, toBoneMatrix } from './w3dSkin';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface BoneTransform {
  t: Vec3;
  q: Quat;
}

export interface Pose {
  world: BoneTransform[];
  visible: boolean[];
  opacity: number[];
}

const multiply = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export const rotate = ([x, y, z, w]: Quat, v: Vec3): Vec3 => {
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);

  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
};

const compose = (outer: BoneTransform, inner: BoneTransform): BoneTransform => {
  const r = rotate(outer.q, inner.t);

  return {
    t: [r[0] + outer.t[0], r[1] + outer.t[1], r[2] + outer.t[2]],
    q: multiply(outer.q, inner.q),
  };
};

export type SkeletonBones = Pick<SceneSkeleton, 'names' | 'parents'>;

const isSameSkeleton = (a: SkeletonBones, b: SkeletonBones): boolean =>
  a.names.length === b.names.length &&
  a.names.every(
    (name, at) =>
      a.parents[at] === b.parents[at] &&
      name.toLowerCase() === b.names[at].toLowerCase(),
  );

export const isOwnClip = (
  skeleton: SceneSkeleton,
  animation: Pick<W3dAnimation, 'hierarchyName'>,
  clipSkeleton: SkeletonBones | undefined,
): boolean =>
  animation.hierarchyName.toLowerCase() === skeleton.name.toLowerCase() ||
  (!!clipSkeleton && isSameSkeleton(skeleton, clipSkeleton));

export const describeForeignClip = (
  animation: Pick<W3dAnimation, 'name' | 'hierarchyName'>,
): string =>
  `${animation.name} is made for ${animation.hierarchyName}; retail would apply it by bone number`;

const toOpacity = (raw: number): number =>
  Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;

export const poseAt = (
  skeleton: SceneSkeleton,
  animation?: W3dAnimation,
  frame = 0,
): Pose => {
  const count = skeleton.parents.length;
  const byBone = new Map<number, SampledChannel[]>();

  for (const channel of animation?.channels ?? []) {
    if (channel.pivot > 0 && channel.pivot < count) {
      byBone.set(channel.pivot, [
        ...(byBone.get(channel.pivot) ?? []),
        channel,
      ]);
    }
  }

  const world: BoneTransform[] = [];
  const visible: boolean[] = [];
  const opacity: number[] = [];

  for (let bone = 0; bone < count; bone++) {
    const delta: BoneTransform = { t: [0, 0, 0], q: [0, 0, 0, 1] };
    let shown = true;
    let opaqueness = 1;

    for (const channel of byBone.get(bone) ?? []) {
      const value = sampleChannel(channel, frame, animation!);

      if (!value) {
        continue;
      }
      switch (channel.kind) {
        case 'x':
          delta.t[0] = value[0];
          break;
        case 'y':
          delta.t[1] = value[0];
          break;
        case 'z':
          delta.t[2] = value[0];
          break;
        case 'rotation':
          delta.q = value as Quat;
          break;
        case 'visibility':
          shown = value[0] > 0.5;
          break;
        case 'opacity':
          opaqueness = toOpacity(value[0]);
          break;
      }
    }

    const bind: BoneTransform = {
      t: skeleton.translations.slice(bone * 3, bone * 3 + 3) as Vec3,
      q: skeleton.rotations.slice(bone * 4, bone * 4 + 4) as Quat,
    };
    const parent = skeleton.parents[bone];
    const placed =
      parent >= 0 && parent < bone ? compose(world[parent], bind) : bind;

    world.push(compose(placed, delta));
    visible.push(shown);
    opacity.push(opaqueness);
  }

  return { world, visible, opacity };
};

export const isMeshShown = (mesh: SceneMesh, pose: Pose): boolean =>
  mesh.bone === undefined || (pose.visible[mesh.bone] ?? true);

export const getMeshOpacity = (mesh: SceneMesh, pose: Pose): number =>
  mesh.bone === undefined ? 1 : (pose.opacity[mesh.bone] ?? 1);

export const skin = (
  mesh: SceneMesh,
  pose: Pose,
  positions: Float32Array,
  normals?: Float32Array,
): void => {
  positions.set(mesh.positions);
  if (normals && mesh.normals) {
    normals.set(mesh.normals);
  }
  if (mesh.local) {
    skinVertices(
      mesh.local,
      pose.world.map((bone) => toBoneMatrix(bone.t, bone.q)),
      positions,
      normals,
    );
  }
};

export const buildBoneLines = (skeleton: SceneSkeleton, pose: Pose): number[] =>
  pose.world.flatMap((bone, index) => {
    const parent = pose.world[skeleton.parents[index]];

    return parent ? [...parent.t, ...bone.t] : [];
  });
