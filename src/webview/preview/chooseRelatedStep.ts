import type { RelatedModel } from '../../game/objects/findRelatedModels';

export type RelatedStep =
  | { kind: 'show'; file?: string }
  | { kind: 'play'; file: string }
  | { kind: 'showThenPlay'; model?: string; file: string };

export interface ShownModel {
  file: string;
  openedFile: string;
  hierarchy?: string;
}

const lower = (text: string | undefined) => text?.toLowerCase();

export const chooseRelatedStep = (
  entry: RelatedModel,
  shown: ShownModel,
): RelatedStep => {
  const fileOf = (name: string) =>
    name === shown.openedFile ? undefined : name;

  if (entry.kind !== 'animation') {
    return { kind: 'show', file: fileOf(entry.file) };
  }

  const isSameRig =
    !!entry.hierarchy && lower(entry.hierarchy) === lower(shown.hierarchy);

  return isSameRig || !entry.model || entry.model === shown.file
    ? { kind: 'play', file: entry.file }
    : { kind: 'showThenPlay', model: fileOf(entry.model), file: entry.file };
};
