import type { ForeignClip } from '../../formats/w3d/w3dModelFinder';
import type { ClipChoice, ClipList } from '../shared/viewer/createClipPicker';

const withoutExtension = (file: string) => file.replace(/\.w3d$/i, '');

export const listFileClips = (
  thisFile: ClipChoice[],
  own: string[],
  foreign: ForeignClip[],
): ClipList => ({
  own: [
    ...thisFile,
    ...own.map((file) => ({ id: file, label: withoutExtension(file) })),
  ],
  foreign: foreign.map(({ file, hierarchyName }) => ({
    id: file,
    label: `${withoutExtension(file)} (${hierarchyName})`,
  })),
});
