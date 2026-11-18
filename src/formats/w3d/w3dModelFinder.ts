import type { ToolBox } from '../../services/toolRegistry';
import { parseW3dTool } from './w3dTools';
import type { LoadFile } from './w3dScene';

const MAX_TRIED = 24;

export const modelCandidates = (
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

export const findModelForSkeleton = async (
  skeleton: string,
  names: readonly string[],
  loadFile: LoadFile,
  tools: ToolBox,
): Promise<string | undefined> => {
  const parse = tools.use(parseW3dTool);

  for (const name of modelCandidates(skeleton, names).slice(0, MAX_TRIED)) {
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
