import type { W3dHeader } from '../../formats/w3d/readW3dHeader';
import type { ObjectScene } from './objectScene';

export type RelatedModelKind = 'model' | 'skeleton' | 'animation';

export interface DrawStateUse {
  object: string;
  state: string;
}

export interface RelatedModel {
  file: string;
  kind: RelatedModelKind;
  hierarchy?: string;
  uses: DrawStateUse[];
  model?: string;
}

export interface RelatedModelSources {
  readHeader(file: string): Promise<W3dHeader | undefined>;
  listNames(): Promise<readonly string[]>;
  findScenes(file: string): Promise<ObjectScene[]>;
}

const MAX_OBJECTS = 8;
const MAX_HEADER_READS = 96;
const MAX_USES = 4;
const MAX_SEED_MODELS = 2;
const KIND_ORDER: Record<RelatedModelKind, number> = {
  model: 0,
  skeleton: 1,
  animation: 2,
};

const lower = (text: string) => text.toLowerCase();

export const getModelFileName = (model: string): string =>
  `${lower(model.slice(model.search(/[^\\/]*$/)).replace(/\.w3d$/i, ''))}.w3d`;

export const readAnimationValue = (
  value: string,
): { file: string; hierarchy?: string } => {
  const dot = value.lastIndexOf('.');

  return {
    file: `${lower(value.slice(dot + 1))}.w3d`,
    hierarchy: dot > 0 ? value.slice(0, dot) : undefined,
  };
};

const getRigStem = (name: string) =>
  lower(name)
    .replace(/\.w3d$/, '')
    .replace(/_[^_]*$/, '');

export const listRigCandidates = (
  hierarchy: string,
  openedFile: string,
  names: readonly string[],
): string[] => {
  const skeletonNames = [`${lower(hierarchy)}.w3d`, `${lower(hierarchy)}_skl.w3d`];
  const stems = new Set(
    [getRigStem(hierarchy), getRigStem(openedFile)].filter(Boolean),
  );
  const named = names.filter((name) =>
    [...stems].some(
      (stem) => name === `${stem}.w3d` || name.startsWith(`${stem}_`),
    ),
  );

  return [...new Set([...skeletonNames, ...named.sort()])].filter(
    (name) => name !== openedFile,
  );
};

export const findRelatedModels = async (
  openedFile: string,
  openedHeader: W3dHeader,
  sources: RelatedModelSources,
): Promise<RelatedModel[]> => {
  const opened = lower(openedFile);
  const hierarchy = openedHeader.hierarchy;
  const related = new Map<string, RelatedModel>();
  const named = new Map<
    string,
    { uses: DrawStateUse[]; model?: string; hierarchy?: string }
  >();

  const isOwnRig = (header: W3dHeader | undefined) =>
    !!hierarchy && lower(header?.hierarchy ?? '') === lower(hierarchy);

  if (hierarchy) {
    const candidates = listRigCandidates(
      hierarchy,
      opened,
      await sources.listNames(),
    ).slice(0, MAX_HEADER_READS);

    for (const file of candidates) {
      const header = await sources.readHeader(file);

      if (
        header &&
        (header.kind === 'model' || header.kind === 'skeleton') &&
        isOwnRig(header)
      ) {
        related.set(file, {
          file,
          kind: header.kind,
          hierarchy: header.hierarchy,
          uses: [],
        });
      }
    }
  }

  const nameUse = (
    file: string,
    use: DrawStateUse,
    extra: { model?: string; hierarchy?: string } = {},
  ) => {
    const entry = named.get(file) ?? { uses: [] };

    if (entry.uses.length < MAX_USES) {
      entry.uses.push(use);
    }
    entry.model ??= extra.model;
    entry.hierarchy ??= extra.hierarchy;
    named.set(file, entry);
  };
  const readScenes = async (file: string, seen: Set<string>) => {
    for (const scene of await sources.findScenes(file)) {
      if (seen.size >= MAX_OBJECTS || seen.has(lower(scene.name))) {
        continue;
      }
      seen.add(lower(scene.name));
      for (const state of scene.states) {
        const use = { object: scene.name, state: state.label };
        const model = state.model && getModelFileName(state.model);

        if (model && state.kind === 'model') {
          nameUse(model, use);
        }
        for (const value of state.animations) {
          const animation = readAnimationValue(value);

          nameUse(animation.file, use, {
            model,
            hierarchy: animation.hierarchy,
          });
        }
      }
    }
  };
  const objects = new Set<string>();

  await readScenes(opened, objects);
  if (!objects.size) {
    const seeds = [...related.values()]
      .filter((entry) => entry.kind === 'model')
      .sort(
        (a, b) =>
          Number(!/_skn\.w3d$/.test(a.file)) - Number(!/_skn\.w3d$/.test(b.file)),
      )
      .slice(0, MAX_SEED_MODELS);

    for (const seed of seeds) {
      await readScenes(seed.file, objects);
    }
  }

  for (const [file, { uses, model, hierarchy: written }] of named) {
    const known = related.get(file);
    const header = known ? undefined : await sources.readHeader(file);

    if (known) {
      known.uses = uses;
      known.model ??= model;
    } else if (header && header.kind !== 'other') {
      related.set(file, {
        file,
        kind: header.kind,
        hierarchy: header.hierarchy ?? written,
        uses,
        model,
      });
    }
  }
  related.delete(opened);

  return [...related.values()]
    .map((entry) =>
      !entry.model || entry.model === opened || related.has(entry.model)
        ? entry
        : { ...entry, model: undefined },
    )
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.file.localeCompare(b.file),
    );
};
