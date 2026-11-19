import type { ToolBox } from '../../core/toolRegistry';
import { readAnimationHierarchyName } from './w3dAnimation';
import { isOwnClip } from './w3dPose';
import type { SkeletonBones } from './w3dPose';
import { buildW3dScene, loadSkeleton } from './w3dScene';
import type { ModelScene, SceneSkeleton } from './w3dScene';
import type { LoadFile } from './w3dSceneDraws';
import { parseW3dTool } from './w3dTools';

const MAX_TRIED = 24;

export const listModelCandidates = (
  skeleton: string,
  names: readonly string[],
): string[] => {
  const stem = skeleton.toLowerCase().replace(/_skl$/, '');
  const own = `${skeleton.toLowerCase()}.w3d`;
  const rank = (name: string) =>
    name === `${stem}_skn.w3d`
      ? 0
      : name === `${stem}.w3d`
        ? 1
        : /_skn\.w3d$/.test(name)
          ? 2
          : 3;

  return names
    .map((name) => name.toLowerCase())
    .filter(
      (name) =>
        name !== own &&
        name.endsWith('.w3d') &&
        (name === `${stem}.w3d` || name.startsWith(`${stem}_`)),
    )
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

export interface ForeignClip {
  file: string;
  hierarchyName: string;
}

export interface SkeletonClips {
  own: string[];
  foreign: ForeignClip[];
}

export const sortClipsBySkeleton = async (
  skeleton: SceneSkeleton,
  names: readonly string[],
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<SkeletonClips> => {
  const clipSkeletons = new Map<string, SkeletonBones | undefined>();
  const clips: SkeletonClips = { own: [], foreign: [] };

  for (const file of names) {
    const bytes = await loadFile(file);
    let hierarchyName: string | undefined;

    try {
      hierarchyName = bytes && readAnimationHierarchyName(bytes);
    } catch {
      continue;
    }
    if (hierarchyName === undefined) {
      continue;
    }

    const key = hierarchyName.toLowerCase();

    if (key !== skeleton.name.toLowerCase() && !clipSkeletons.has(key)) {
      clipSkeletons.set(
        key,
        await loadSkeleton(hierarchyName, loadFile, tools),
      );
    }

    if (isOwnClip(skeleton, { hierarchyName }, clipSkeletons.get(key))) {
      clips.own.push(file);
    } else {
      clips.foreign.push({ file, hierarchyName });
    }
  }

  return clips;
};

export interface AnimationCarrier {
  name?: string;
  scene?: ModelScene;
}

export const findAnimationCarrier = async (
  skeletonName: string,
  iniModel: string | undefined,
  listNames: () => Promise<readonly string[]>,
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<AnimationCarrier> => {
  const iniBytes = iniModel ? await loadFile(iniModel) : undefined;
  const iniScene =
    iniBytes && (await buildW3dScene(iniBytes, loadFile, tools));

  if (iniScene?.skeleton) {
    return { name: iniModel, scene: iniScene };
  }

  const name = await findModelForSkeleton(
    skeletonName,
    await listNames(),
    loadFile,
    tools,
  );
  const bytes = name ? await loadFile(name) : undefined;

  return {
    name,
    scene: bytes && (await buildW3dScene(bytes, loadFile, tools)),
  };
};

export const findModelForSkeleton = async (
  skeleton: string,
  names: readonly string[],
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<string | undefined> => {
  const parse = tools.use(parseW3dTool);

  for (const name of listModelCandidates(skeleton, names).slice(0, MAX_TRIED)) {
    const bytes = await loadFile(name);

    if (!bytes) {
      continue;
    }
    try {
      const file = await parse(bytes);

      if (
        file.meshes.length &&
        file.hlod?.hierarchyName.toLowerCase() === skeleton.toLowerCase()
      ) {
        return name;
      }
    } catch {
    }
  }
  return undefined;
};
